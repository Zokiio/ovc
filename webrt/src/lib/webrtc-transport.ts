import { SignalingClient } from './signaling'

export type WebRTCTransportState = 'idle' | 'connecting' | 'connected' | 'failed' | 'closed'

type StateListener = (state: WebRTCTransportState) => void
type AudioListener = (userId: string, audioData: ArrayBuffer) => void

export class WebRTCTransport {
  private signaling: SignalingClient
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private state: WebRTCTransportState = 'idle'
  private stateListeners = new Set<StateListener>()
  private audioListeners = new Set<AudioListener>()
  private pendingCandidates: RTCIceCandidateInit[] = []
  private hasRemoteDescription = false
  private hasRequestedStart = false
  private destroyed = false
  private readonly stunServers: string[]
  private readonly textDecoder = new TextDecoder()

  constructor(signaling: SignalingClient, stunServers?: string[]) {
    this.signaling = signaling
    this.stunServers = (stunServers || []).filter(Boolean)
  }

  public onStateChange(listener: StateListener): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  public onAudio(listener: AudioListener): () => void {
    this.audioListeners.add(listener)
    return () => this.audioListeners.delete(listener)
  }

  public isReady(): boolean {
    return this.dataChannel?.readyState === 'open'
  }

  public async start(): Promise<void> {
    if (this.state !== 'idle') {
      return
    }

    this.updateState('connecting')

    this.pc = new RTCPeerConnection({
      iceServers: this.stunServers.length > 0
        ? this.stunServers.map((url) => ({ urls: url }))
        : undefined
    })

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.signaling.sendIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        })
      } else {
        this.signaling.sendIceCandidateComplete()
      }
    }

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) {
        return
      }
      const state = this.pc.iceConnectionState
      if (state === 'connected' || state === 'completed') {
        if (!this.hasRequestedStart) {
          this.hasRequestedStart = true
          this.signaling.startDataChannel()
        }
      }
      if (state === 'failed' || state === 'disconnected') {
        this.updateState('failed')
      }
    }

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) {
        return
      }
      const state = this.pc.connectionState
      if (state === 'failed') {
        this.updateState('failed')
      }
      if (state === 'closed') {
        this.updateState('closed')
      }
    }

    this.pc.ondatachannel = (event) => {
      if (!this.dataChannel) {
        this.setupDataChannel(event.channel)
      }
    }

    this.setupDataChannel(this.pc.createDataChannel('audio', {
      ordered: false,
      maxRetransmits: 0
    }))

    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)
    this.signaling.sendOffer(offer.sdp || '')

    this.signaling.on('message:answer', this.handleAnswer)
    this.signaling.on('message:ice_candidate', this.handleRemoteCandidate)
  }

  public close(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    this.signaling.off('message:answer', this.handleAnswer)
    this.signaling.off('message:ice_candidate', this.handleRemoteCandidate)

    if (this.dataChannel) {
      try {
        this.dataChannel.close()
      } catch {
        // ignore
      }
      this.dataChannel = null
    }

    if (this.pc) {
      try {
        this.pc.close()
      } catch {
        // ignore
      }
      this.pc = null
    }

    this.updateState('closed')
  }

  public sendAudioBinary(audioData: ArrayBuffer): void {
    if (this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(audioData)
    }
  }

  private handleAnswer = async (data: unknown) => {
    if (!this.pc || this.destroyed) {
      return
    }
    const payload = data as { sdp?: string }
    if (!payload?.sdp) {
      return
    }

    try {
      await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      this.hasRemoteDescription = true
      this.flushPendingCandidates()
    } catch (err) {
      console.warn('[WebRTC] Failed to set remote description:', err)
      this.updateState('failed')
    }
  }

  private handleRemoteCandidate = async (data: unknown) => {
    if (!this.pc || this.destroyed) {
      return
    }
    const payload = data as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; complete?: boolean }
    if (payload?.complete) {
      try {
        await this.pc.addIceCandidate()
      } catch {
        // ignore completion errors
      }
      return
    }

    if (!payload?.candidate) {
      return
    }

    const candidate: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: payload.sdpMid ?? undefined,
      sdpMLineIndex: payload.sdpMLineIndex ?? undefined
    }

    if (!this.hasRemoteDescription) {
      this.pendingCandidates.push(candidate)
      return
    }

    try {
      await this.pc.addIceCandidate(candidate)
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err)
    }
  }

  private flushPendingCandidates() {
    if (!this.pc || !this.hasRemoteDescription) {
      return
    }
    const pending = this.pendingCandidates
    this.pendingCandidates = []
    pending.forEach((candidate) => {
      this.pc?.addIceCandidate(candidate).catch(() => undefined)
    })
  }

  private setupDataChannel(channel: RTCDataChannel) {
    this.dataChannel = channel
    channel.binaryType = 'arraybuffer'

    channel.onopen = () => {
      this.updateState('connected')
    }

    channel.onclose = () => {
      if (this.state !== 'closed') {
        this.updateState('closed')
      }
    }

    channel.onerror = () => {
      this.updateState('failed')
    }

    channel.onmessage = (event) => {
      void this.handleDataMessage(event.data)
    }
  }

  private async handleDataMessage(data: unknown): Promise<void> {
    let buffer: ArrayBuffer | null = null
    if (data instanceof ArrayBuffer) {
      buffer = data
    } else if (data instanceof Blob) {
      buffer = await data.arrayBuffer()
    } else {
      return
    }

    if (buffer.byteLength < 3) {
      return
    }

    const view = new DataView(buffer)
    const version = view.getUint8(0)
    if (version !== 1) {
      return
    }
    const idLength = view.getUint8(1)
    if (buffer.byteLength < 2 + idLength) {
      return
    }
    const idBytes = new Uint8Array(buffer, 2, idLength)
    const userId = this.textDecoder.decode(idBytes)
    const audioStart = 2 + idLength
    const audioData = buffer.slice(audioStart)

    this.audioListeners.forEach((listener) => listener(userId, audioData))
  }

  private updateState(nextState: WebRTCTransportState) {
    if (this.state === nextState) {
      return
    }
    this.state = nextState
    this.stateListeners.forEach((listener) => listener(nextState))
  }
}
