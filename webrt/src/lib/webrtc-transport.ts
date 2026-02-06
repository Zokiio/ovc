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
  private readonly logPrefix = '[WebRTC]'

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

    console.info(`${this.logPrefix} Starting transport`, {
      stunServers: this.stunServers
    })
    this.updateState('connecting')

    this.pc = new RTCPeerConnection({
      iceServers: this.stunServers.length > 0
        ? this.stunServers.map((url) => ({ urls: url }))
        : undefined
    })

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.debug(`${this.logPrefix} Local ICE candidate`, {
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        })
        this.signaling.sendIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid,
          sdpMLineIndex: event.candidate.sdpMLineIndex
        })
      } else {
        console.info(`${this.logPrefix} ICE gathering complete`)
        this.signaling.sendIceCandidateComplete()
      }
    }

    this.pc.onicegatheringstatechange = () => {
      if (!this.pc) {
        return
      }
      console.info(`${this.logPrefix} ICE gathering state`, this.pc.iceGatheringState)
    }

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) {
        return
      }
      const state = this.pc.iceConnectionState
      console.info(`${this.logPrefix} ICE connection state`, state)
      if (state === 'connected' || state === 'completed') {
        if (!this.hasRequestedStart) {
          this.hasRequestedStart = true
          console.info(`${this.logPrefix} ICE connected, requesting DataChannel start`)
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
      console.info(`${this.logPrefix} Peer connection state`, state)
      if (state === 'failed') {
        this.updateState('failed')
      }
      if (state === 'closed') {
        this.updateState('closed')
      }
    }

    this.pc.onsignalingstatechange = () => {
      if (!this.pc) {
        return
      }
      console.info(`${this.logPrefix} Signaling state`, this.pc.signalingState)
    }

    this.pc.ondatachannel = (event) => {
      console.info(`${this.logPrefix} DataChannel received`, event.channel.label)
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
    console.info(`${this.logPrefix} Local description set, sending offer`)
    this.signaling.sendOffer(offer.sdp || '')

    this.signaling.on('message:answer', this.handleAnswer)
    this.signaling.on('message:ice_candidate', this.handleRemoteCandidate)
  }

  public close(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    console.info(`${this.logPrefix} Closing transport`)
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
      console.info(`${this.logPrefix} Received answer, applying remote description`)
      await this.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
      this.hasRemoteDescription = true
      this.flushPendingCandidates()
    } catch (err) {
      console.warn(`${this.logPrefix} Failed to set remote description:`, err)
      this.updateState('failed')
    }
  }

  private handleRemoteCandidate = async (data: unknown) => {
    if (!this.pc || this.destroyed) {
      return
    }
    const payload = data as { candidate?: string; sdpMid?: string | null; sdpMLineIndex?: number | null; complete?: boolean }
    if (payload?.complete) {
      console.info(`${this.logPrefix} Remote ICE candidates complete`)
      try {
        await this.pc.addIceCandidate(null)
      } catch {
        // ignore completion errors
      }
      return
    }

    if (!payload?.candidate) {
      return
    }

    const hasMid = payload.sdpMid != null && payload.sdpMid !== ''
    const hasMLine = typeof payload.sdpMLineIndex === 'number' && payload.sdpMLineIndex >= 0
    if (!hasMid && !hasMLine) {
      console.warn(`${this.logPrefix} Remote ICE candidate missing sdpMid/sdpMLineIndex, skipping`)
      return
    }

    const candidate: RTCIceCandidateInit = {
      candidate: payload.candidate,
      sdpMid: hasMid ? payload.sdpMid : undefined,
      sdpMLineIndex: hasMLine ? payload.sdpMLineIndex : undefined
    }

    if (!this.hasRemoteDescription) {
      console.debug(`${this.logPrefix} Queueing remote ICE candidate (no remote description yet)`)
      this.pendingCandidates.push(candidate)
      return
    }

    try {
      console.debug(`${this.logPrefix} Adding remote ICE candidate`)
      await this.pc.addIceCandidate(candidate)
    } catch (err) {
      console.warn(`${this.logPrefix} Failed to add ICE candidate:`, err)
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
      console.info(`${this.logPrefix} DataChannel open`, channel.label)
      this.updateState('connected')
    }

    channel.onclose = () => {
      console.info(`${this.logPrefix} DataChannel closed`, channel.label)
      if (this.state !== 'closed') {
        this.updateState('closed')
      }
    }

    channel.onerror = () => {
      console.warn(`${this.logPrefix} DataChannel error`, channel.label)
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
