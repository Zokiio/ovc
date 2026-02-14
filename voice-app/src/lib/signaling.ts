import type { AudioCodec, AudioCodecConfig, GroupSettings, SignalingEvents, TransportMode } from './types'
import { createLogger } from './logger'

export interface SignalingMessage {
  type: string
  data: Record<string, unknown>
}

interface ResumeSessionInfo {
  sessionId: string
  resumeToken: string
  expiresAt: number
}

type EventCallback<T = unknown> = (data: T) => void

const HEARTBEAT_FALLBACK_INTERVAL_MS = 5000
const MIN_HEARTBEAT_INTERVAL_MS = 1000
const MAX_HEARTBEAT_INTERVAL_MS = 60000
const RESUME_STORAGE_PREFIX = 'voice_app_resume_v1'
const SUPPORTED_AUDIO_CODECS: AudioCodec[] = ['opus']
const PREFERRED_AUDIO_CODEC: AudioCodec = 'opus'
const logger = createLogger('Signaling')

/**
 * WebSocket signaling client for WebRTC coordination.
 * Handles: authentication, heartbeat/resume, group management, and signaling.
 */
export class SignalingClient {
  private ws: WebSocket | null = null
  private clientId: string = ''
  private username: string = ''
  private authCode: string = ''
  private currentGroupId: string | null = null
  private lastHeartbeatTime: number = 0
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private heartbeatIntervalMs: number = HEARTBEAT_FALLBACK_INTERVAL_MS
  private resumeWindowMs: number = 0
  private sessionId: string = ''
  private resumeToken: string = ''
  private activeServerUrl: string = ''
  private resumeKeyUrl: string = ''
  private transportMode: TransportMode = 'auto'
  private pendingGameSession = false
  private stunServers: string[] = []
  private audioCodec: AudioCodec = 'pcm'
  private audioCodecs: AudioCodec[] = []
  private audioCodecConfig: AudioCodecConfig | null = null
  private eventListeners: Map<string, EventCallback[]> = new Map()
  private connectResolve: (() => void) | null = null
  private connectReject: ((error: Error) => void) | null = null
  private connectTimeout: ReturnType<typeof setTimeout> | null = null
  private settledConnect: boolean = false

  // Throttle logging for high-frequency messages
  private readonly highFrequencyMessages = new Set(['position_update', 'user_speaking_status'])

  /**
   * Connect to signaling and resolve only after auth/resume succeeds.
   */
  public async connect(serverUrl: string, username: string, authCode: string): Promise<void> {
    this.disconnect()

    return new Promise((resolve, reject) => {
      try {
        const url = this.normalizeUrl(serverUrl)
        this.ws = new WebSocket(url)
        this.username = username
        this.authCode = authCode
        this.activeServerUrl = url
        this.resumeKeyUrl = this.normalizeResumeKey(url)
        this.clientId = ''
        this.currentGroupId = null
        this.transportMode = 'auto'
        this.pendingGameSession = false
        this.stunServers = []
        this.audioCodec = 'pcm'
        this.audioCodecs = []
        this.audioCodecConfig = null
        this.settleConnectHandlers(resolve, reject)

        this.connectTimeout = setTimeout(() => {
          this.rejectPendingConnect(new Error('Connection timeout'))
          this.ws?.close()
        }, 15000)

        this.ws.onopen = () => {
          this.sendResumeOrAuthenticate()
          this.startHeartbeatInterval()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            logger.error('Failed to parse message:', error)
          }
        }

        this.ws.onerror = (event) => {
          logger.error('WebSocket error:', event)
          this.emit('connection_error', event)
          this.rejectPendingConnect(new Error('WebSocket error'))
        }

        this.ws.onclose = (event) => {
          this.stopHeartbeatInterval()
          this.clearConnectTimeout()
          this.emit('disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          })
          this.rejectPendingConnect(new Error(event.reason || 'Connection closed'))
        }
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private settleConnectHandlers(resolve: () => void, reject: (error: Error) => void): void {
    this.connectResolve = resolve
    this.connectReject = reject
    this.settledConnect = false
  }

  private resolvePendingConnect(): void {
    if (!this.settledConnect && this.connectResolve) {
      this.settledConnect = true
      this.clearConnectTimeout()
      this.connectResolve()
    }
  }

  private rejectPendingConnect(error: Error): void {
    if (!this.settledConnect && this.connectReject) {
      this.settledConnect = true
      this.clearConnectTimeout()
      this.connectReject(error)
    }
  }

  private clearConnectTimeout(): void {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = null
    }
  }

  private normalizeUrl(serverUrl: string): string {
    let url = serverUrl
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
      const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
      url = `${protocol}${url}`
    }
    if (!url.endsWith('/voice')) {
      url = url + (url.endsWith('/') ? 'voice' : '/voice')
    }
    return url
  }

  private sendResumeOrAuthenticate(): void {
    const resumeInfo = this.loadResumeInfo(this.resumeKeyUrl, this.username)
    if (resumeInfo) {
      this.send({
        type: 'resume',
        data: {
          sessionId: resumeInfo.sessionId,
          resumeToken: resumeInfo.resumeToken,
          audioCodecs: SUPPORTED_AUDIO_CODECS,
          preferredAudioCodec: PREFERRED_AUDIO_CODEC,
        },
      })
      return
    }

    this.authenticate(this.username, this.authCode)
  }

  private authenticate(username: string, authCode: string): void {
    this.send({
      type: 'authenticate',
      data: {
        username,
        authCode,
        audioCodecs: SUPPORTED_AUDIO_CODECS,
        preferredAudioCodec: PREFERRED_AUDIO_CODEC,
      },
    })
  }

  private send(message: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  private handleMessage(message: SignalingMessage): void {
    const { type, data } = message

    if (!this.highFrequencyMessages.has(type)) {
      logger.debug('Received:', type)
    }

    switch (type) {
      case 'auth_success':
      case 'resumed':
        this.handleSessionReady(data)
        break
      case 'hello':
        this.handleHello(data)
        break
      case 'pending_game_session':
        this.pendingGameSession = true
        this.emit('pending_game_session', data)
        break
      case 'game_session_ready':
        this.pendingGameSession = false
        this.emit('game_session_ready', data)
        break
      case 'heartbeat_ack':
        this.handleHeartbeatAck(data)
        break
      case 'error':
        this.handleError(data)
        break
      case 'pong':
        this.emitLatency(Date.now() - this.lastHeartbeatTime)
        break
      case 'group_created':
        this.currentGroupId = String(data.groupId || '')
        this.emit('group_created', data)
        break
      case 'group_joined':
        this.currentGroupId = String(data.groupId || '')
        this.emit('group_joined', data)
        break
      case 'group_left':
        this.currentGroupId = null
        this.emit('group_left', data)
        break
      case 'group_list':
        this.emit('group_list', data)
        break
      case 'group_members_updated':
        this.emit('group_members_updated', data)
        break
      case 'player_list':
        this.emit('player_list', data)
        break
      case 'user_speaking_status':
        this.emit('user_speaking_status', data)
        break
      case 'user_mute_status':
        this.emit('user_mute_status', data)
        break
      case 'set_mic_mute':
        this.emit('set_mic_mute', data)
        break
      case 'position_update':
        this.emit('position_update', data)
        break
      case 'audio':
        this.emit('audio', data)
        break
      case 'offer':
      case 'webrtc_offer':
        this.emit('webrtc_offer', data)
        break
      case 'answer':
      case 'webrtc_answer':
        this.emit('webrtc_answer', data)
        break
      case 'ice_candidate':
      case 'webrtc_ice_candidate':
        this.emit('webrtc_ice_candidate', data)
        break
      default:
        this.emit(`message:${type}`, data)
    }
  }

  private handleSessionReady(data: Record<string, unknown>): void {
    const pending = !!data.pending
    this.clientId = String(data.clientId || '')
    this.transportMode = this.parseTransportMode(data.transportMode)
    this.pendingGameSession = pending
    this.stunServers = this.parseStunServers(data.stunServers)
    this.audioCodec = this.parseAudioCodec(data.audioCodec)
    this.audioCodecs = this.parseAudioCodecs(data.audioCodecs)
    this.audioCodecConfig = this.parseAudioCodecConfig(data.audioCodecConfig)
    this.sessionId = typeof data.sessionId === 'string' ? data.sessionId : ''
    this.resumeToken = typeof data.resumeToken === 'string' ? data.resumeToken : ''

    const heartbeatIntervalMs = this.readIntervalMs(data.heartbeatIntervalMs)
    const resumeWindowMs = this.readNumber(data.resumeWindowMs)
    if (heartbeatIntervalMs > 0) {
      this.heartbeatIntervalMs = heartbeatIntervalMs
      this.startHeartbeatInterval()
    }
    if (resumeWindowMs > 0) {
      this.resumeWindowMs = resumeWindowMs
    }

    if (this.sessionId && this.resumeToken && this.resumeKeyUrl) {
      this.storeResumeInfo(this.resumeKeyUrl, this.username, this.sessionId, this.resumeToken, this.resumeWindowMs)
    }

    this.emit('authenticated', {
      clientId: this.clientId,
      username: this.username,
      transportMode: this.transportMode,
      stunServers: this.stunServers,
      audioCodec: this.audioCodec,
      audioCodecs: this.audioCodecs,
      audioCodecConfig: this.audioCodecConfig ?? undefined,
      useProximityRadar: this.readBoolean(data.useProximityRadar),
      useProximityRadarSpeakingOnly: this.readBoolean(data.useProximityRadarSpeakingOnly),
      groupSpatialAudio: this.readBoolean(data.groupSpatialAudio),
      pending,
      pendingMessage: typeof data.pendingMessage === 'string' ? data.pendingMessage : undefined,
      pendingTimeoutSeconds: this.readNumber(data.pendingTimeoutSeconds) || undefined,
      sessionId: this.sessionId || undefined,
      resumeToken: this.resumeToken || undefined,
      heartbeatIntervalMs: heartbeatIntervalMs || undefined,
      resumeWindowMs: resumeWindowMs || undefined,
    })
    this.resolvePendingConnect()
  }

  private handleHello(data: Record<string, unknown>): void {
    const heartbeatIntervalMs = this.readIntervalMs(data.heartbeatIntervalMs)
    const resumeWindowMs = this.readNumber(data.resumeWindowMs)
    const audioCodec = this.parseAudioCodec(data.audioCodec)
    const audioCodecs = this.parseAudioCodecs(data.audioCodecs)
    const audioCodecConfig = this.parseAudioCodecConfig(data.audioCodecConfig)
    if (heartbeatIntervalMs > 0) {
      this.heartbeatIntervalMs = heartbeatIntervalMs
      this.startHeartbeatInterval()
    }
    if (resumeWindowMs > 0) {
      this.resumeWindowMs = resumeWindowMs
      this.refreshResumeExpiry()
    }
    this.audioCodec = audioCodec
    if (audioCodecs.length > 0) {
      this.audioCodecs = audioCodecs
    }
    if (audioCodecConfig) {
      this.audioCodecConfig = audioCodecConfig
    }
    this.emit('hello', {
      heartbeatIntervalMs: heartbeatIntervalMs || undefined,
      resumeWindowMs: resumeWindowMs || undefined,
      useProximityRadar: this.readBoolean(data.useProximityRadar),
      useProximityRadarSpeakingOnly: this.readBoolean(data.useProximityRadarSpeakingOnly),
      groupSpatialAudio: this.readBoolean(data.groupSpatialAudio),
      audioCodec,
      audioCodecs,
      audioCodecConfig: audioCodecConfig ?? undefined,
    })
  }

  private handleHeartbeatAck(data: Record<string, unknown>): void {
    const timestamp = this.readNumber(data.timestamp)
    const reference = timestamp > 0 ? timestamp : this.lastHeartbeatTime
    if (reference > 0) {
      this.emitLatency(Date.now() - reference)
    }
    this.refreshResumeExpiry()
  }

  private handleError(data: Record<string, unknown>): void {
    const code = typeof data.code === 'string' ? data.code : ''
    if (code === 'resume_failed') {
      this.handleResumeFailed()
    }
    this.emit('error', data)
    if (!this.settledConnect && code !== 'resume_failed') {
      const message = typeof data.message === 'string' ? data.message : 'Server error'
      this.rejectPendingConnect(new Error(message))
    }
  }

  private handleResumeFailed(): void {
    this.clearResumeInfo(this.resumeKeyUrl || this.activeServerUrl, this.username)
    if (this.isConnected()) {
      this.authenticate(this.username, this.authCode)
    }
  }

  private emitLatency(latency: number): void {
    if (!Number.isFinite(latency) || latency < 0) {
      return
    }
    this.emit('latency', { latency })
  }

  private startHeartbeatInterval(): void {
    this.stopHeartbeatInterval()
    const interval = this.heartbeatIntervalMs > 0 ? this.heartbeatIntervalMs : HEARTBEAT_FALLBACK_INTERVAL_MS
    this.heartbeatInterval = setInterval(() => this.sendHeartbeat(), interval)
  }

  private stopHeartbeatInterval(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private sendHeartbeat(): void {
    this.lastHeartbeatTime = Date.now()
    this.send({
      type: 'heartbeat',
      data: { timestamp: this.lastHeartbeatTime },
    })
  }

  private parseTransportMode(value: unknown): TransportMode {
    if (value === 'webrtc' || value === 'websocket' || value === 'auto') {
      return value
    }
    return 'auto'
  }

  private parseStunServers(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return []
    }
    return value
      .map((entry) => String(entry))
      .filter((entry) => entry.trim().length > 0)
  }

  private parseAudioCodec(value: unknown): AudioCodec {
    if (value === 'opus' || value === 'pcm') {
      return value
    }
    return 'pcm'
  }

  private parseAudioCodecs(value: unknown): AudioCodec[] {
    if (!Array.isArray(value)) {
      return []
    }
    const codecs = value
      .filter((entry): entry is AudioCodec => entry === 'opus' || entry === 'pcm')
    return Array.from(new Set(codecs))
  }

  private parseAudioCodecConfig(value: unknown): AudioCodecConfig | null {
    if (!value || typeof value !== 'object') {
      return null
    }
    const raw = value as Record<string, unknown>
    const sampleRate = this.readNumber(raw.sampleRate)
    const channels = this.readNumber(raw.channels)
    const frameDurationMs = this.readNumber(raw.frameDurationMs)
    const targetBitrate = this.readNumber(raw.targetBitrate)
    if (sampleRate <= 0 || channels <= 0 || frameDurationMs <= 0 || targetBitrate <= 0) {
      return null
    }
    return { sampleRate, channels, frameDurationMs, targetBitrate }
  }

  private readNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string') {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
  }

  /**
   * Reads a heartbeat interval from untrusted input and clamps it to a safe range.
   */
  private readIntervalMs(value: unknown): number {
    const numeric = this.readNumber(value)
    if (numeric < MIN_HEARTBEAT_INTERVAL_MS) {
      return 0
    }
    const max = MAX_HEARTBEAT_INTERVAL_MS
    return numeric > max ? max : numeric
  }

  private readBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'number') {
      return value === 1
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      return normalized === 'true' || normalized === '1' || normalized === 'yes'
    }
    return false
  }

  private normalizeResumeKey(serverUrl: string): string {
    try {
      const parsed = new URL(serverUrl)
      const host = parsed.host
      let path = parsed.pathname.replace(/\/+$/, '')
      if (!path.endsWith('/voice')) {
        path = `${path}/voice`
      }
      return `${host}${path}`
    } catch {
      return serverUrl
    }
  }

  private getResumeStorageKey(serverUrl: string, username: string): string {
    return `${RESUME_STORAGE_PREFIX}:${serverUrl}:${username}`
  }

  private loadResumeInfo(serverUrl: string, username: string): ResumeSessionInfo | null {
    const key = this.getResumeStorageKey(serverUrl, username)
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw) as ResumeSessionInfo
      if (!parsed.sessionId || !parsed.resumeToken || !parsed.expiresAt) {
        this.clearResumeInfo(serverUrl, username)
        return null
      }
      if (parsed.expiresAt < Date.now()) {
        this.clearResumeInfo(serverUrl, username)
        return null
      }
      return parsed
    } catch {
      this.clearResumeInfo(serverUrl, username)
      return null
    }
  }

  private storeResumeInfo(
    serverUrl: string,
    username: string,
    sessionId: string,
    resumeToken: string,
    resumeWindowMs: number
  ): void {
    if (!sessionId || !resumeToken) {
      return
    }
    const ttl = resumeWindowMs > 0 ? resumeWindowMs : 60000
    const info: ResumeSessionInfo = {
      sessionId,
      resumeToken,
      expiresAt: Date.now() + ttl,
    }
    const key = this.getResumeStorageKey(serverUrl, username)
    window.localStorage.setItem(key, JSON.stringify(info))
  }

  private refreshResumeExpiry(): void {
    if (!this.resumeKeyUrl || !this.sessionId || !this.resumeToken) {
      return
    }
    this.storeResumeInfo(this.resumeKeyUrl, this.username, this.sessionId, this.resumeToken, this.resumeWindowMs)
  }

  private clearResumeInfo(serverUrl: string, username: string): void {
    if (!serverUrl || !username) {
      return
    }
    const key = this.getResumeStorageKey(serverUrl, username)
    window.localStorage.removeItem(key)
  }

  // ========== Public API ==========

  public createGroup(groupName: string, settings?: Partial<GroupSettings> & { password?: string; isPermanent?: boolean }): void {
    const payload: Record<string, unknown> = {
      groupName,
      settings: {
        defaultVolume: settings?.defaultVolume ?? 100,
        proximityRange: settings?.proximityRange ?? 30.0,
        allowInvites: settings?.allowInvites ?? true,
        maxMembers: settings?.maxMembers ?? 50,
        isIsolated: settings?.isIsolated ?? true,
      },
    }
    if (settings?.password) {
      payload.password = settings.password
    }
    if (settings?.isPermanent) {
      payload.isPermanent = true
    }
    this.send({ type: 'create_group', data: payload })
  }

  public joinGroup(groupId: string, password?: string): void {
    const data: Record<string, unknown> = { groupId }
    if (password) {
      data.password = password
    }
    this.send({ type: 'join_group', data })
  }

  public leaveGroup(): void {
    this.send({ type: 'leave_group', data: {} })
  }

  public listGroups(): void {
    this.send({ type: 'list_groups', data: {} })
  }

  public listPlayers(): void {
    this.send({ type: 'list_players', data: {} })
  }

  public getGroupMembers(groupId: string): void {
    this.send({ type: 'get_group_members', data: { groupId } })
  }

  public updateGroupPassword(groupId: string, password: string | null): void {
    this.send({ type: 'update_group_password', data: { groupId, password } })
  }

  public setGroupPermanent(groupId: string, isPermanent: boolean): void {
    this.send({ type: 'set_group_permanent', data: { groupId, isPermanent } })
  }

  public updateSpeakingStatus(isSpeaking: boolean): void {
    this.send({ type: 'user_speaking', data: { isSpeaking } })
  }

  public updateMuteStatus(isMuted: boolean): void {
    this.send({ type: 'user_mute', data: { isMuted } })
  }

  public ping(): void {
    this.lastHeartbeatTime = Date.now()
    this.send({ type: 'ping', data: { timestamp: this.lastHeartbeatTime } })
  }

  public sendAudioBase64(audioData: string): void {
    this.send({ type: 'audio', data: { audioData } })
  }

  // WebRTC signaling (canonical server names)
  public sendWebRTCOffer(sdp: string): void {
    this.send({ type: 'offer', data: { sdp } })
  }

  public sendWebRTCAnswer(sdp: string): void {
    this.send({ type: 'answer', data: { sdp } })
  }

  public sendICECandidate(candidate: RTCIceCandidateInit): void {
    this.send({
      type: 'ice_candidate',
      data: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex,
      },
    })
  }

  public sendICECandidateComplete(): void {
    this.send({
      type: 'ice_candidate',
      data: { complete: true },
    })
  }

  public requestStartDataChannel(): void {
    this.send({ type: 'start_datachannel', data: {} })
  }

  public disconnect(): void {
    this.stopHeartbeatInterval()
    this.clearConnectTimeout()
    this.connectResolve = null
    this.connectReject = null
    this.settledConnect = true
    this.pendingGameSession = false
    this.audioCodec = 'pcm'
    this.audioCodecs = []
    this.audioCodecConfig = null
    if (this.ws) {
      this.send({ type: 'disconnect', data: {} })
      this.ws.close()
      this.ws = null
    }
  }

  // Event system
  public on<K extends keyof SignalingEvents>(event: K, callback: EventCallback<SignalingEvents[K]>): void
  public on(event: string, callback: EventCallback): void
  public on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  public off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners) {
      return
    }
    const index = listeners.indexOf(callback)
    if (index > -1) {
      listeners.splice(index, 1)
    }
  }

  public removeAllListeners(): void {
    this.eventListeners.clear()
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach((callback) => callback(data))
    }
  }

  // Getters
  public getClientId(): string {
    return this.clientId
  }

  public getCurrentGroupId(): string | null {
    return this.currentGroupId
  }

  public getUsername(): string {
    return this.username
  }

  public getTransportMode(): TransportMode {
    return this.transportMode
  }

  public isPendingSession(): boolean {
    return this.pendingGameSession
  }

  public getStunServers(): string[] {
    return [...this.stunServers]
  }

  public getAudioCodec(): AudioCodec {
    return this.audioCodec
  }

  public getAudioCodecs(): AudioCodec[] {
    return [...this.audioCodecs]
  }

  public getAudioCodecConfig(): AudioCodecConfig | null {
    return this.audioCodecConfig ? { ...this.audioCodecConfig } : null
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }
}

// Singleton
let instance: SignalingClient | null = null

export function getSignalingClient(): SignalingClient {
  if (!instance) {
    instance = new SignalingClient()
  }
  return instance
}

export function resetSignalingClient(): void {
  if (instance) {
    instance.disconnect()
    instance.removeAllListeners()
    instance = null
  }
}
