import { Group, User, GroupSettings, ConnectionState } from './types'

export interface SignalingMessage {
  type: string
  data: Record<string, unknown>
}

export class SignalingClient {
  private ws: WebSocket | null = null
  private clientId: string = ''
  private username: string = ''
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
    this.onMessage('player_list', (data) => this.handlePlayerList(data))
    this.onMessage('auth_success', (data) => this.handleAuthSuccess(data))
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

        this.ws.onopen = () => {
          this.authenticate(username, authCode)
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
    this.clientId = String(data.clientId || '')
    this.emit('authenticated', { clientId: this.clientId, username: this.username })
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
