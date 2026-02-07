import { Group, User, GroupSettings, ConnectionState } from './types'

export interface SignalingMessage {
  type: string
  data: Record<string, unknown>
}

interface ResumeSessionInfo {
  serverUrl: string
  username: string
  sessionId: string
  resumeToken: string
  expiresAt: number
}

const RESUME_STORAGE_PREFIX = 'hvc-resume'
const DEFAULT_RESUME_WINDOW_MS = 30000
const RESUME_FALLBACK_MS = 2000

export class SignalingClient {
  private ws: WebSocket | null = null
  private clientId: string = ''
  private username: string = ''
  private authCode: string = ''
  private sessionId: string = ''
  private resumeToken: string = ''
  private activeServerUrl: string = ''
  private resumeKeyUrl: string = ''
  private resumeWindowMs: number = 0
  private heartbeatIntervalMs: number = 0
  private heartbeatTimer: number | null = null
  private resumeAttempted: boolean = false
  private resumeFallbackTimer: number | null = null
  private currentGroupId: string | null = null
  private lastPingTime: number = 0
  private lastPongTime: number = 0
  private messageHandlers: Map<string, (data: Record<string, unknown>) => void> = new Map()
  private eventListeners: Map<string, ((data: unknown) => void)[]> = new Map()
  private audioPlaybackCallback: ((userId: string, audioData: string) => void) | null = null
  
  // Throttle logging for high-frequency messages
  private highFrequencyMessages = new Set(['position_update', 'user_speaking_status', 'audio'])
  private lastLogTime: Map<string, number> = new Map()
  private logThrottle = 5000 // Log high-frequency messages at most once per 5 seconds

  constructor() {
    // Register default handlers
    this.onMessage('group_created', (data) => this.handleGroupCreated(data))
    this.onMessage('group_joined', (data) => this.handleGroupJoined(data))
    this.onMessage('group_left', (data) => this.handleGroupLeft(data))
    this.onMessage('group_list', (data) => this.handleGroupList(data))
    this.onMessage('group_members_updated', (data) => this.handleGroupMembersUpdated(data))
    this.onMessage('user_speaking_status', (data) => this.handleUserSpeakingStatus(data))
    this.onMessage('user_mute_status', (data) => this.handleUserMuteStatus(data))
    this.onMessage('set_mic_mute', (data) => this.handleSetMicMute(data))
    this.onMessage('player_list', (data) => this.handlePlayerList(data))
    this.onMessage('auth_success', (data) => this.handleAuthSuccess(data))
    this.onMessage('resumed', (data) => this.handleResumed(data))
    this.onMessage('hello', (data) => this.handleHello(data))
    this.onMessage('heartbeat_ack', (data) => this.handleHeartbeatAck(data))
    this.onMessage('pending_game_session', (data) => this.handlePendingGameSession(data))
    this.onMessage('game_session_ready', (data) => this.handleGameSessionReady(data))
    this.onMessage('pong', (data) => this.handlePong(data))
    this.onMessage('audio', (data) => this.handleAudio(data))
    this.onMessage('position_update', (data) => this.handlePositionUpdate(data))
  }

  /**
   * Connect to the WebRTC signaling server
   */
  public async connect(serverUrl: string, username: string, authCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.stopHeartbeat()
        this.clearResumeFallback()
        this.resumeAttempted = false

        // Ensure server URL has proper protocol
        let url = serverUrl
        if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
          // Use secure WebSocket if page is HTTPS, otherwise insecure
          const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
          url = `${protocol}${url}`
        }
        // Ensure /voice path
        if (!url.endsWith('/voice')) {
          url = url + (url.endsWith('/') ? 'voice' : '/voice')
        }

        this.ws = new WebSocket(url)
        this.username = username
        this.authCode = authCode
        this.activeServerUrl = url
        this.resumeKeyUrl = this.normalizeResumeKey(url)
        this.clientId = ''
        this.currentGroupId = null
        this.sessionId = ''
        this.resumeToken = ''

        this.ws.onopen = () => {
          const resumeInfo = this.loadResumeInfo(this.resumeKeyUrl, username)
          if (resumeInfo) {
            console.info('[Signaling] Attempting session resume')
            this.sessionId = resumeInfo.sessionId
            this.resumeToken = resumeInfo.resumeToken
            this.resumeAttempted = true
            this.send({
              type: 'resume',
              data: {
                sessionId: this.sessionId,
                resumeToken: this.resumeToken
              }
            })
            this.startResumeFallback()
          } else {
            this.authenticate(username, authCode)
          }
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse message:', error)
          }
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          this.emit('connection_error', error)
          reject(error)
        }

        this.ws.onclose = (event) => {
          this.stopHeartbeat()
          this.clearResumeFallback()
          this.emit('disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          })
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Authenticate with the server
   */
  private authenticate(username: string, authCode: string): void {
    this.send({
      type: 'authenticate',
      data: { username, authCode },
    })
  }

  /**
   * Send a signaling message
   */
  private send(message: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected')
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  /**
   * Register a handler for incoming messages
   */
  private onMessage(type: string, handler: (data: Record<string, unknown>) => void): void {
    this.messageHandlers.set(type, handler)
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: SignalingMessage): void {
    // Throttle logging for high-frequency messages
    const shouldLog = !this.highFrequencyMessages.has(message.type) || 
      (() => {
        const now = Date.now()
        const lastLog = this.lastLogTime.get(message.type) || 0
        if (now - lastLog >= this.logThrottle) {
          this.lastLogTime.set(message.type, now)
          return true
        }
        return false
      })()
    
    if (shouldLog) {
      console.debug('[Signaling] Message received:', message.type, message.data)
    }

    const isResumeFailed = message.type === 'error' && (message.data as { code?: string })?.code === 'resume_failed'
    if (isResumeFailed) {
      this.handleResumeFailed(message.data)
      return
    }

    const handler = this.messageHandlers.get(message.type)
    if (handler) {
      handler(message.data)
    } else if (message.type === 'error') {
      console.error('[Signaling] Server error:', message.data)
    }

    this.emit(`message:${message.type}`, message.data)
  }

  // ========== Message Handlers ==========

  private handleAuthSuccess(data: Record<string, unknown>): void {
    this.handleSessionReady(data, false)
  }

  private handleResumed(data: Record<string, unknown>): void {
    this.handleSessionReady(data, true)
  }

  private handleHello(data: Record<string, unknown>): void {
    const heartbeatIntervalMs = Number(data.heartbeatIntervalMs || 0)
    if (heartbeatIntervalMs > 0) {
      this.applyHeartbeatInterval(heartbeatIntervalMs)
    }
    const resumeWindowMs = Number(data.resumeWindowMs || 0)
    if (resumeWindowMs > 0) {
      this.resumeWindowMs = resumeWindowMs
      this.refreshResumeExpiry()
    }
  }

  private handleHeartbeatAck(data: Record<string, unknown>): void {
    const timestamp = Number(data.timestamp || 0)
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
      return
    }
    const latency = Date.now() - timestamp
    this.emit('latency', { latency })
  }

  private handlePendingGameSession(data: Record<string, unknown>): void {
    this.emit('pending_game_session', data)
  }

  private handleGameSessionReady(data: Record<string, unknown>): void {
    this.emit('game_session_ready', data)
  }

  private handleGroupCreated(data: Record<string, unknown>): void {
    const groupId = String(data.groupId || '')
    this.currentGroupId = groupId
    this.emit('group_created', data)
  }

  private handleGroupJoined(data: Record<string, unknown>): void {
    const groupId = String(data.groupId || '')
    this.currentGroupId = groupId
    this.emit('group_joined', data)
  }

  private handleGroupLeft(data: Record<string, unknown>): void {
    this.currentGroupId = null
    this.emit('group_left', data)
  }

  private handleGroupList(data: Record<string, unknown>): void {
    this.emit('group_list', data)
  }

  private handleGroupMembersUpdated(data: Record<string, unknown>): void {
    this.emit('group_members_updated', data)
  }

  private handleUserSpeakingStatus(data: Record<string, unknown>): void {
    this.emit('user_speaking_status', data)
  }

  private handleUserMuteStatus(data: Record<string, unknown>): void {
    this.emit('user_mute_status', data)
  }

  private handleSetMicMute(data: Record<string, unknown>): void {
    this.emit('set_mic_mute', data)
  }

  private handlePlayerList(data: Record<string, unknown>): void {
    this.emit('player_list', data)
  }

  private handlePong(data: Record<string, unknown>): void {
    const timestamp = Number(data.timestamp || 0)
    const latency = Date.now() - timestamp
    this.lastPongTime = Date.now()
    this.emit('latency', { latency })
  }

  private handleAudio(data: Record<string, unknown>): void {
    const userId = String(data.userId || data.senderId || '')
    const audioData = String(data.audioData || '')
    
    
    if (userId && audioData && this.audioPlaybackCallback) {
      this.audioPlaybackCallback(userId, audioData)
    }
    
    this.emit('audio', { userId, audioData })
  }

  private handlePositionUpdate(data: Record<string, unknown>): void {
    // Forward position updates to listeners
    this.emit('position_update', data)
  }

  private handleSessionReady(data: Record<string, unknown>, resumed: boolean): void {
    this.clientId = String(data.clientId || '')
    const sessionId = String(data.sessionId || this.sessionId || '')
    const resumeToken = String(data.resumeToken || this.resumeToken || '')
    if (sessionId) {
      this.sessionId = sessionId
    }
    if (resumeToken) {
      this.resumeToken = resumeToken
    }

    const resumeWindowMs = Number(data.resumeWindowMs || 0)
    if (resumeWindowMs > 0) {
      this.resumeWindowMs = resumeWindowMs
    }

    const heartbeatIntervalMs = Number(data.heartbeatIntervalMs || 0)
    if (heartbeatIntervalMs > 0) {
      this.applyHeartbeatInterval(heartbeatIntervalMs)
    }

    if (this.sessionId && this.resumeToken && this.resumeKeyUrl) {
      this.storeResumeInfo(this.resumeKeyUrl, this.username, this.sessionId, this.resumeToken, this.resumeWindowMs)
    }

    this.resumeAttempted = false
    this.clearResumeFallback()

    this.emit('authenticated', {
      clientId: this.clientId,
      username: this.username,
      pending: Boolean(data.pending),
      pendingMessage: data.pendingMessage,
      pendingTimeoutSeconds: data.pendingTimeoutSeconds,
      transportMode: data.transportMode,
      stunServers: data.stunServers,
      resumed
    })
  }

  private applyHeartbeatInterval(intervalMs: number): void {
    if (intervalMs <= 0) {
      return
    }
    this.heartbeatIntervalMs = intervalMs
    this.stopHeartbeat()
    this.sendHeartbeat()
    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeat()
    }, intervalMs)
  }

  private sendHeartbeat(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    this.send({
      type: 'heartbeat',
      data: { timestamp: Date.now() }
    })
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private startResumeFallback(): void {
    this.clearResumeFallback()
    this.resumeFallbackTimer = window.setTimeout(() => {
      if (!this.resumeAttempted) {
        return
      }
      console.warn('[Signaling] Resume timed out, falling back to authenticate')
      this.resumeAttempted = false
      if (this.isConnected()) {
        this.authenticate(this.username, this.authCode)
      }
    }, RESUME_FALLBACK_MS)
  }

  private clearResumeFallback(): void {
    if (this.resumeFallbackTimer) {
      clearTimeout(this.resumeFallbackTimer)
      this.resumeFallbackTimer = null
    }
  }

  private handleResumeFailed(data: Record<string, unknown>): void {
    if (!this.resumeAttempted) {
      return
    }
    console.warn('[Signaling] Resume failed, falling back to authenticate', data)
    this.clearResumeInfo(this.resumeKeyUrl || this.activeServerUrl, this.username)
    this.resumeAttempted = false
    this.clearResumeFallback()
    if (this.isConnected()) {
      this.authenticate(this.username, this.authCode)
    }
  }

  private refreshResumeExpiry(): void {
    if (!this.resumeKeyUrl || !this.sessionId || !this.resumeToken) {
      return
    }
    this.storeResumeInfo(this.resumeKeyUrl, this.username, this.sessionId, this.resumeToken, this.resumeWindowMs)
  }

  private getResumeStorageKey(serverUrl: string, username: string): string {
    return `${RESUME_STORAGE_PREFIX}:${serverUrl}:${username}`
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

  private loadResumeInfo(serverUrl: string, username: string): ResumeSessionInfo | null {
    const key = this.getResumeStorageKey(serverUrl, username)
    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        return null
      }
      const parsed = JSON.parse(raw) as ResumeSessionInfo
      if (!parsed?.sessionId || !parsed.resumeToken || !parsed.expiresAt) {
        localStorage.removeItem(key)
        return null
      }
      if (parsed.expiresAt < Date.now()) {
        localStorage.removeItem(key)
        return null
      }
      return parsed
    } catch (error) {
      console.warn('[Signaling] Failed to load resume info:', error)
      localStorage.removeItem(key)
      return null
    }
  }

  private storeResumeInfo(serverUrl: string, username: string, sessionId: string, resumeToken: string, resumeWindowMs?: number): void {
    const windowMs = resumeWindowMs && resumeWindowMs > 0 ? resumeWindowMs : (this.resumeWindowMs || DEFAULT_RESUME_WINDOW_MS)
    const payload: ResumeSessionInfo = {
      serverUrl,
      username,
      sessionId,
      resumeToken,
      expiresAt: Date.now() + windowMs
    }
    try {
      const key = this.getResumeStorageKey(serverUrl, username)
      localStorage.setItem(key, JSON.stringify(payload))
    } catch (error) {
      console.warn('[Signaling] Failed to store resume info:', error)
    }
  }

  private clearResumeInfo(serverUrl: string, username: string): void {
    if (!serverUrl || !username) {
      return
    }
    try {
      const key = this.getResumeStorageKey(serverUrl, username)
      localStorage.removeItem(key)
    } catch (error) {
      console.warn('[Signaling] Failed to clear resume info:', error)
    }
  }

  // ========== Public API Methods ==========

  /**
   * Create a new group
   */
  public createGroup(groupName: string, settings?: Partial<GroupSettings>): void {
    const groupSettings = {
      defaultVolume: settings?.defaultVolume ?? 100,
      proximityRange: settings?.proximityRange ?? 30.0,
      allowInvites: settings?.allowInvites ?? true,
      maxMembers: settings?.maxMembers ?? 50,
    }

    this.send({
      type: 'create_group',
      data: {
        groupName,
        settings: groupSettings,
      },
    })
  }

  public sendOffer(sdp: string): void {
    this.send({
      type: 'offer',
      data: { sdp }
    })
  }

  public sendIceCandidate(candidate: RTCIceCandidateInit): void {
    this.send({
      type: 'ice_candidate',
      data: {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? null,
        sdpMLineIndex: candidate.sdpMLineIndex ?? null
      }
    })
  }

  public sendIceCandidateComplete(): void {
    this.send({
      type: 'ice_candidate',
      data: { complete: true }
    })
  }

  public startDataChannel(): void {
    this.send({
      type: 'start_datachannel',
      data: {}
    })
  }

  /**
   * Join an existing group
   */
  public joinGroup(groupId: string): void {
    this.send({
      type: 'join_group',
      data: { groupId },
    })
  }

  /**
   * Leave current group
   */
  public leaveGroup(): void {
    this.send({
      type: 'leave_group',
      data: {},
    })
  }

  /**
   * List all available groups
   */
  public listGroups(): void {
    this.send({
      type: 'list_groups',
      data: {},
    })
  }

  /**
   * List all connected players
   */
  public listPlayers(): void {
    this.send({
      type: 'list_players',
      data: {},
    })
  }

  /**
   * Get members of a group
   */
  public getGroupMembers(groupId: string): void {
    this.send({
      type: 'get_group_members',
      data: { groupId },
    })
  }

  /**
   * Send audio data
   */
  public sendAudio(audioData: string): void {
    // audio data should be base64 encoded
    this.send({
      type: 'audio',
      data: { audioData },
    })
  }

  /**
   * Set callback for processing incoming audio from other users
   */
  public setAudioPlaybackCallback(callback: (userId: string, audioData: string) => void): void {
    this.audioPlaybackCallback = callback
  }

  /**
   * Update speaking status (from VAD)
   */
  public updateSpeakingStatus(isSpeaking: boolean): void {
    this.send({
      type: 'user_speaking',
      data: { isSpeaking },
    })
  }

  /**
   * Update microphone mute status
   */
  public updateMuteStatus(isMuted: boolean): void {
    this.send({
      type: 'user_mute',
      data: { isMuted },
    })
  }

  /**
   * Send ping for latency measurement
   */
  public ping(): void {
    this.lastPingTime = Date.now()
    this.send({
      type: 'ping',
      data: { timestamp: this.lastPingTime },
    })
  }

  /**
   * Disconnect from server
   */
  public disconnect(): void {
    if (this.ws) {
      this.send({
        type: 'disconnect',
        data: {},
      })
      this.ws.close()
      this.ws = null
    }
    this.stopHeartbeat()
    this.clearResumeFallback()
    this.resumeAttempted = false
  }

  /**
   * Register event listener
   */
  public on(event: string, callback: (data: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(callback)
  }

  /**
   * Unregister event listener
   */
  public off(event: string, callback: (data: unknown) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  /**
   * Remove all event listeners
   */
  public removeAllListeners(): void {
    this.eventListeners.clear()
  }

  /**
   * Emit event
   */
  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach((callback) => callback(data))
    }
  }

  // ========== Getters ==========

  public getClientId(): string {
    return this.clientId
  }

  public getCurrentGroupId(): string | null {
    return this.currentGroupId
  }

  public getUsername(): string {
    return this.username
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  public getLastPongTime(): number {
    return this.lastPongTime
  }
}

/**
 * Singleton instance
 */
let instance: SignalingClient | null = null

export function getSignalingClient(): SignalingClient {
  if (!instance) {
    instance = new SignalingClient()
  }
  return instance
}
