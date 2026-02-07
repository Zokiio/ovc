import type { GroupSettings, SignalingEvents } from './types'

export interface SignalingMessage {
  type: string
  data: Record<string, unknown>
}

type EventCallback<T = unknown> = (data: T) => void

/**
 * WebSocket signaling client for WebRTC coordination.
 * Handles: authentication, group management, user presence, and WebRTC signaling.
 * Does NOT handle audio transport (that's DataChannel's job).
 */
export class SignalingClient {
  private ws: WebSocket | null = null
  private clientId: string = ''
  private username: string = ''
  private currentGroupId: string | null = null
  private lastPingTime: number = 0
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private eventListeners: Map<string, EventCallback[]> = new Map()
  
  // Throttle logging for high-frequency messages
  private highFrequencyMessages = new Set(['position_update', 'user_speaking_status'])

  /**
   * Connect to the signaling server
   */
  public async connect(serverUrl: string, username: string, authCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        let url = this.normalizeUrl(serverUrl)
        
        this.ws = new WebSocket(url)
        this.username = username

        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'))
          this.ws?.close()
        }, 10000)

        this.ws.onopen = () => {
          clearTimeout(timeout)
          this.authenticate(username, authCode)
          this.startPingInterval()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('[Signaling] Failed to parse message:', error)
          }
        }

        this.ws.onerror = (error) => {
          clearTimeout(timeout)
          console.error('[Signaling] WebSocket error:', error)
          this.emit('connection_error', error)
          reject(error)
        }

        this.ws.onclose = (event) => {
          clearTimeout(timeout)
          this.stopPingInterval()
          this.emit('disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          })
        }
      } catch (error) {
        reject(error)
      }
    })
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

  private authenticate(username: string, authCode: string): void {
    this.send({ type: 'authenticate', data: { username, authCode } })
  }

  private send(message: SignalingMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Signaling] WebSocket not connected')
      return
    }
    this.ws.send(JSON.stringify(message))
  }

  private handleMessage(message: SignalingMessage): void {
    const { type, data } = message

    // Throttle logging for high-frequency messages
    if (!this.highFrequencyMessages.has(type)) {
      console.debug('[Signaling] Received:', type)
    }

    switch (type) {
      case 'auth_success':
        this.clientId = String(data.clientId || '')
        this.emit('authenticated', { clientId: this.clientId, username: this.username })
        break
      case 'error':
        console.error('[Signaling] Server error:', data)
        this.emit('error', data)
        break
      case 'pong':
        const latency = Date.now() - this.lastPingTime
        this.emit('latency', { latency })
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
      case 'position_update':
        this.emit('position_update', data)
        break
      // WebRTC signaling messages
      case 'webrtc_offer':
        this.emit('webrtc_offer', data)
        break
      case 'webrtc_answer':
        this.emit('webrtc_answer', data)
        break
      case 'webrtc_ice_candidate':
        this.emit('webrtc_ice_candidate', data)
        break
      default:
        // Emit as generic message for extensibility
        this.emit(`message:${type}`, data)
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => this.ping(), 5000)
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  // ========== Public API ==========

  public createGroup(groupName: string, settings?: Partial<GroupSettings>): void {
    this.send({
      type: 'create_group',
      data: {
        groupName,
        settings: {
          defaultVolume: settings?.defaultVolume ?? 100,
          proximityRange: settings?.proximityRange ?? 30.0,
          allowInvites: settings?.allowInvites ?? true,
          maxMembers: settings?.maxMembers ?? 50,
        },
      },
    })
  }

  public joinGroup(groupId: string): void {
    this.send({ type: 'join_group', data: { groupId } })
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

  public updateSpeakingStatus(isSpeaking: boolean): void {
    this.send({ type: 'user_speaking', data: { isSpeaking } })
  }

  public updateMuteStatus(isMuted: boolean): void {
    this.send({ type: 'user_mute', data: { isMuted } })
  }

  public ping(): void {
    this.lastPingTime = Date.now()
    this.send({ type: 'ping', data: { timestamp: this.lastPingTime } })
  }

  // WebRTC signaling
  public sendWebRTCOffer(targetId: string, sdp: string): void {
    this.send({ type: 'webrtc_offer', data: { targetId, sdp } })
  }

  public sendWebRTCAnswer(targetId: string, sdp: string): void {
    this.send({ type: 'webrtc_answer', data: { targetId, sdp } })
  }

  public sendICECandidate(targetId: string, candidate: RTCIceCandidateInit): void {
    this.send({ type: 'webrtc_ice_candidate', data: { targetId, candidate } })
  }

  public disconnect(): void {
    this.stopPingInterval()
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
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) listeners.splice(index, 1)
    }
  }

  public removeAllListeners(): void {
    this.eventListeners.clear()
  }

  private emit(event: string, data: unknown): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      listeners.forEach((cb) => cb(data))
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
