import type { WebRTCState, WebRTCConnectionState } from '../types'
import { getSignalingClient } from '../signaling'
import { createLogger } from '../logger'

export interface RTCConfig {
  iceServers: RTCIceServer[]
}

const DEFAULT_CONFIG: RTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

type ConnectionEventCallback = (state: WebRTCState) => void
type DataChannelCallback = (data: ArrayBuffer) => void
type SignalingDataHandler = (data: unknown) => void
const logger = createLogger('WebRTC')

/**
 * WebRTC Connection Manager
 * Manages peer connection to the SFU server for audio transport via DataChannel.
 */
export class WebRTCConnectionManager {
  private peerConnection: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private config: RTCConfig
  private state: WebRTCState = {
    connectionState: 'new',
    dataChannelState: 'closed',
    iceConnectionState: 'new',
  }
  
  private onStateChange: ConnectionEventCallback | null = null
  private onAudioData: DataChannelCallback | null = null
  private answerListener: SignalingDataHandler | null = null
  private iceCandidateListener: SignalingDataHandler | null = null
  private pendingRemoteCandidates: RTCIceCandidateInit[] = []
  private startDataChannelRequested = false

  constructor(config: RTCConfig = DEFAULT_CONFIG) {
    this.config = config
  }

  /**
   * Set callback for connection state changes
   */
  public setOnStateChange(callback: ConnectionEventCallback): void {
    this.onStateChange = callback
  }

  /**
   * Set callback for incoming audio data
   */
  public setOnAudioData(callback: DataChannelCallback): void {
    this.onAudioData = callback
  }

  /**
   * Get current connection state
   */
  public getState(): WebRTCState {
    return { ...this.state }
  }

  /**
   * Update STUN/TURN servers before connect.
   */
  public setIceServers(serverUrls: string[]): void {
    if (this.peerConnection) {
      return
    }

    const urls = serverUrls
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    if (urls.length === 0) {
      this.config = DEFAULT_CONFIG
      return
    }

    this.config = {
      iceServers: urls.map((url) => ({ urls: url })),
    }
  }

  /**
   * Initialize WebRTC connection
   */
  public async connect(): Promise<void> {
    if (this.peerConnection) {
      logger.warn('Already connected or connecting')
      return
    }

    try {
      this.updateState({ connectionState: 'connecting' })
      logger.debug('Starting connection...')

      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      })

      this.pendingRemoteCandidates = []
      this.startDataChannelRequested = false
      this.setupPeerConnectionListeners()
      this.setupSignalingListeners()

      // Create data channel for audio (before creating offer)
      this.dataChannel = this.peerConnection.createDataChannel('audio', {
        // Real-time voice prefers low latency over strict ordering.
        ordered: false,
      })
      logger.debug('DataChannel created')

      this.setupDataChannelListeners()

      // Create and send offer
      const offer = await this.peerConnection.createOffer()
      await this.peerConnection.setLocalDescription(offer)
      logger.debug('Offer created and local description set')

      // Send offer via signaling
      const signaling = getSignalingClient()
      signaling.sendWebRTCOffer(offer.sdp!)
      logger.debug('Offer sent via signaling')

    } catch (error) {
      logger.error('Connection error:', error)
      this.updateState({ connectionState: 'failed' })
      throw error
    }
  }

  private setupPeerConnectionListeners(): void {
    if (!this.peerConnection) return

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState
      logger.debug('Connection state:', state)
      
      this.updateState({
        connectionState: this.mapConnectionState(state),
      })
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection?.iceConnectionState
      logger.debug('ICE connection state:', iceState)
      
      this.updateState({
        iceConnectionState: iceState || 'new',
      })

      if (!this.startDataChannelRequested && (iceState === 'connected' || iceState === 'completed')) {
        this.startDataChannelRequested = true
        getSignalingClient().requestStartDataChannel()
      }
    }

    this.peerConnection.onicecandidate = (event) => {
      const signaling = getSignalingClient()
      if (event.candidate) {
        signaling.sendICECandidate(event.candidate.toJSON())
      } else {
        signaling.sendICECandidateComplete()
      }
    }

    // Handle incoming data channel (if server creates one)
    this.peerConnection.ondatachannel = (event) => {
      logger.debug('Incoming data channel:', event.channel.label)
      if (event.channel.label === 'audio' && !this.dataChannel) {
        this.dataChannel = event.channel
        this.setupDataChannelListeners()
      }
    }
  }

  private setupDataChannelListeners(): void {
    if (!this.dataChannel) return

    this.dataChannel.binaryType = 'arraybuffer'

    this.dataChannel.onopen = () => {
      logger.debug('DataChannel open - ready to send/receive audio')
      this.updateState({ dataChannelState: 'open' })
    }

    this.dataChannel.onclose = () => {
      logger.debug('DataChannel closed')
      this.updateState({ dataChannelState: 'closed' })
    }

    this.dataChannel.onerror = (error) => {
      logger.error('DataChannel error:', error)
    }

    this.dataChannel.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer && this.onAudioData) {
        logger.debug('Received audio data:', event.data.byteLength, 'bytes')
        this.onAudioData(event.data)
      }
    }
  }

  private setupSignalingListeners(): void {
    const signaling = getSignalingClient()

    this.removeSignalingListeners()

    this.answerListener = (data: unknown) => {
      const { sdp } = data as { sdp: string }
      this.handleAnswer(sdp)
    }

    this.iceCandidateListener = (data: unknown) => {
      const iceData = data as {
        candidate?: string | RTCIceCandidateInit
        sdpMid?: string
        sdpMLineIndex?: number
        complete?: boolean
      }
      
      // Check for ICE gathering complete signal
      if (iceData.complete) {
        logger.debug('ICE gathering complete')
        return
      }

      const candidateInit = this.normalizeCandidate(iceData)
      if (!candidateInit?.candidate) {
        logger.debug('Received ICE candidate without candidate string')
        return
      }

      this.handleIceCandidate(candidateInit)
    }

    signaling.on('webrtc_answer', this.answerListener)
    signaling.on('webrtc_ice_candidate', this.iceCandidateListener)
  }

  private removeSignalingListeners(): void {
    const signaling = getSignalingClient()
    if (this.answerListener) {
      signaling.off('webrtc_answer', this.answerListener)
      this.answerListener = null
    }
    if (this.iceCandidateListener) {
      signaling.off('webrtc_ice_candidate', this.iceCandidateListener)
      this.iceCandidateListener = null
    }
  }

  private normalizeCandidate(data: {
    candidate?: string | RTCIceCandidateInit
    sdpMid?: string
    sdpMLineIndex?: number
  }): RTCIceCandidateInit | null {
    if (typeof data.candidate === 'object' && data.candidate !== null) {
      return {
        candidate: data.candidate.candidate ?? '',
        sdpMid: data.candidate.sdpMid ?? null,
        sdpMLineIndex: data.candidate.sdpMLineIndex ?? null,
      }
    }

    if (typeof data.candidate === 'string') {
      return {
        candidate: data.candidate,
        sdpMid: data.sdpMid ?? null,
        sdpMLineIndex: data.sdpMLineIndex ?? null,
      }
    }

    return null
  }

  private async handleAnswer(sdp: string): Promise<void> {
    if (!this.peerConnection) return

    try {
      logger.debug('Received answer, setting remote description...')
      await this.peerConnection.setRemoteDescription({
        type: 'answer',
        sdp,
      })
      logger.debug('Remote description set successfully')
      this.flushPendingRemoteCandidates()
    } catch (error) {
      logger.error('Failed to set remote description:', error)
    }
  }

  private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) return

    // Ignore malformed trickle candidates that cannot be mapped to an m-line.
    if (!candidate.sdpMid && candidate.sdpMLineIndex == null) {
      logger.debug('Skipping ICE candidate missing sdpMid and sdpMLineIndex')
      return
    }

    if (!this.peerConnection.remoteDescription) {
      this.pendingRemoteCandidates.push(candidate)
      return
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (error) {
      logger.error('Failed to add ICE candidate:', error)
    }
  }

  private flushPendingRemoteCandidates(): void {
    if (!this.peerConnection || this.pendingRemoteCandidates.length === 0) {
      return
    }

    const queued = [...this.pendingRemoteCandidates]
    this.pendingRemoteCandidates = []
    queued.forEach((candidate) => {
      void this.handleIceCandidate(candidate)
    })
  }

  /**
   * Send audio data over DataChannel
   * Payload format: [version:1][senderIdLen:1][senderId UTF-8][PCM bytes]
   */
  public sendAudio(audioData: ArrayBuffer): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      return false
    }

    try {
      this.dataChannel.send(audioData)
      return true
    } catch (error) {
      logger.error('Failed to send audio:', error)
      return false
    }
  }

  /**
   * Check if DataChannel is ready for sending
   */
  public isReady(): boolean {
    return this.dataChannel?.readyState === 'open'
  }

  /**
   * Disconnect and clean up
   */
  public disconnect(): void {
    this.removeSignalingListeners()
    this.pendingRemoteCandidates = []
    this.startDataChannelRequested = false

    if (this.dataChannel) {
      this.dataChannel.close()
      this.dataChannel = null
    }

    if (this.peerConnection) {
      this.peerConnection.close()
      this.peerConnection = null
    }

    this.updateState({
      connectionState: 'closed',
      dataChannelState: 'closed',
      iceConnectionState: 'closed',
    })
  }

  private mapConnectionState(state?: RTCPeerConnectionState): WebRTCConnectionState {
    switch (state) {
      case 'new': return 'new'
      case 'connecting': return 'connecting'
      case 'connected': return 'connected'
      case 'disconnected': return 'disconnected'
      case 'failed': return 'failed'
      case 'closed': return 'closed'
      default: return 'new'
    }
  }

  private updateState(updates: Partial<WebRTCState>): void {
    this.state = { ...this.state, ...updates }
    this.onStateChange?.(this.state)
  }
}

// Singleton
let instance: WebRTCConnectionManager | null = null

export function getWebRTCManager(): WebRTCConnectionManager {
  if (!instance) {
    instance = new WebRTCConnectionManager()
  }
  return instance
}

export function resetWebRTCManager(): void {
  if (instance) {
    instance.disconnect()
    instance = null
  }
}
