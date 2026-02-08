import type { AudioCodecConfig } from '../types'
import { createLogger } from '../logger'

type OpusWorkerRequest =
  | {
      type: 'init'
      sampleRate: number
      channels: number
      targetBitrate: number
      frameDurationMs: number
    }
  | {
      type: 'encode'
      requestId: number
      timestampUs: number
      pcm: ArrayBuffer
    }
  | {
      type: 'decode'
      requestId: number
      timestampUs: number
      durationUs: number
      packet: ArrayBuffer
    }
  | {
      type: 'flush'
      requestId: number
    }
  | { type: 'reset' }
  | { type: 'dispose' }

type OpusWorkerEvent =
  | { type: 'ready' }
  | { type: 'encoded'; requestId: number; packet: ArrayBuffer }
  | { type: 'decoded'; requestId: number; pcm: ArrayBuffer; sampleCount: number }
  | { type: 'flushed'; requestId: number }
  | { type: 'reset-done' }
  | { type: 'disposed' }
  | { type: 'error'; requestId?: number; phase: string; message: string }

const logger = createLogger('OpusCodecManager')

function cloneToArrayBuffer(data: Uint8Array | Float32Array): ArrayBuffer {
  const copy = new ArrayBuffer(data.byteLength)
  new Uint8Array(copy).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  return copy
}

export class OpusCodecManager {
  private worker: Worker | null = null
  private ready = false
  private nextRequestId = 1
  private nextTimestampUs = 0
  private currentConfig: AudioCodecConfig | null = null
  private initializingPromise: Promise<void> | null = null

  private pendingInit: { resolve: () => void; reject: (error: Error) => void } | null = null
  private pendingEncodes = new Map<number, { resolve: (packet: Uint8Array) => void; reject: (error: Error) => void }>()
  private pendingDecodes = new Map<number, { resolve: (pcm: Float32Array) => void; reject: (error: Error) => void }>()
  private pendingFlushes = new Map<number, { resolve: () => void; reject: (error: Error) => void }>()

  public static async isSupported(config: AudioCodecConfig): Promise<boolean> {
    if (typeof window === 'undefined') {
      return false
    }
    if (typeof Worker === 'undefined' || typeof AudioEncoder === 'undefined' || typeof AudioDecoder === 'undefined') {
      return false
    }
    if (typeof AudioEncoder.isConfigSupported !== 'function' || typeof AudioDecoder.isConfigSupported !== 'function') {
      return false
    }

    try {
      const [encodeSupport, decodeSupport] = await Promise.all([
        AudioEncoder.isConfigSupported({
          codec: 'opus',
          sampleRate: config.sampleRate,
          numberOfChannels: config.channels,
          bitrate: config.targetBitrate,
        }),
        AudioDecoder.isConfigSupported({
          codec: 'opus',
          sampleRate: config.sampleRate,
          numberOfChannels: config.channels,
        }),
      ])
      return !!encodeSupport.supported && !!decodeSupport.supported
    } catch {
      return false
    }
  }

  public async initialize(config: AudioCodecConfig): Promise<void> {
    if (this.ready && this.currentConfig && this.configMatches(this.currentConfig, config)) {
      return
    }

    if (this.initializingPromise) {
      try {
        await this.initializingPromise
      } catch {
        // allow re-init attempt below
      }
      if (this.ready && this.currentConfig && this.configMatches(this.currentConfig, config)) {
        return
      }
    }

    if (!this.worker) {
      this.worker = new Worker(new URL('../../workers/opus-codec.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = (event: MessageEvent<OpusWorkerEvent>) => this.handleWorkerMessage(event.data)
      this.worker.onerror = (event: ErrorEvent) => {
        const message = event.message || 'Opus worker crashed'
        this.rejectAll(new Error(message))
      }
    }

    this.ready = false
    this.currentConfig = { ...config }
    this.nextTimestampUs = 0

    this.initializingPromise = new Promise<void>((resolve, reject) => {
      this.pendingInit = { resolve, reject }
      this.post({
        type: 'init',
        sampleRate: config.sampleRate,
        channels: config.channels,
        targetBitrate: config.targetBitrate,
        frameDurationMs: config.frameDurationMs,
      })
    })
    try {
      await this.initializingPromise
    } finally {
      this.initializingPromise = null
    }
  }

  public isReady(): boolean {
    return this.ready
  }

  public async encodeFrame(float32Data: Float32Array): Promise<Uint8Array> {
    this.ensureReady()
    const requestId = this.nextRequestId++
    const timestampUs = this.nextTimestampUs
    const frameDurationUs = Math.round((float32Data.length / this.getSampleRate()) * 1_000_000)
    this.nextTimestampUs += Math.max(frameDurationUs, 1)

    return new Promise<Uint8Array>((resolve, reject) => {
      this.pendingEncodes.set(requestId, { resolve, reject })
      const pcmCopy = cloneToArrayBuffer(float32Data)
      this.post(
        {
          type: 'encode',
          requestId,
          timestampUs,
          pcm: pcmCopy,
        },
        [pcmCopy]
      )
    })
  }

  public async decodePacket(opusPacket: Uint8Array, durationUs: number): Promise<Float32Array> {
    this.ensureReady()
    const requestId = this.nextRequestId++
    const timestampUs = this.nextTimestampUs++
    return new Promise<Float32Array>((resolve, reject) => {
      this.pendingDecodes.set(requestId, { resolve, reject })
      const packetCopy = cloneToArrayBuffer(opusPacket)
      this.post(
        {
          type: 'decode',
          requestId,
          timestampUs,
          durationUs,
          packet: packetCopy,
        },
        [packetCopy]
      )
    })
  }

  public async flush(): Promise<void> {
    if (!this.worker) {
      return
    }
    const requestId = this.nextRequestId++
    await new Promise<void>((resolve, reject) => {
      this.pendingFlushes.set(requestId, { resolve, reject })
      this.post({ type: 'flush', requestId })
    })
  }

  public reset(): void {
    if (!this.worker) {
      return
    }
    this.ready = false
    this.nextTimestampUs = 0
    this.post({ type: 'reset' })
  }

  public dispose(): void {
    if (!this.worker) {
      return
    }
    this.post({ type: 'dispose' })
    this.worker.terminate()
    this.worker = null
    this.ready = false
    this.currentConfig = null
    this.initializingPromise = null
    this.rejectAll(new Error('Opus codec disposed'))
  }

  private configMatches(left: AudioCodecConfig, right: AudioCodecConfig): boolean {
    return left.sampleRate === right.sampleRate &&
      left.channels === right.channels &&
      left.frameDurationMs === right.frameDurationMs &&
      left.targetBitrate === right.targetBitrate
  }

  private getSampleRate(): number {
    return this.currentConfig?.sampleRate ?? 48000
  }

  private ensureReady(): void {
    if (!this.worker || !this.ready) {
      throw new Error('Opus codec is not initialized')
    }
  }

  private post(message: OpusWorkerRequest, transfer: Transferable[] = []): void {
    if (!this.worker) {
      throw new Error('Opus worker is not available')
    }
    this.worker.postMessage(message, transfer)
  }

  private handleWorkerMessage(message: OpusWorkerEvent): void {
    switch (message.type) {
      case 'ready': {
        this.ready = true
        this.pendingInit?.resolve()
        this.pendingInit = null
        return
      }
      case 'encoded': {
        const pending = this.pendingEncodes.get(message.requestId)
        if (!pending) return
        this.pendingEncodes.delete(message.requestId)
        pending.resolve(new Uint8Array(message.packet))
        return
      }
      case 'decoded': {
        const pending = this.pendingDecodes.get(message.requestId)
        if (!pending) return
        this.pendingDecodes.delete(message.requestId)
        pending.resolve(new Float32Array(message.pcm, 0, message.sampleCount))
        return
      }
      case 'flushed': {
        const pending = this.pendingFlushes.get(message.requestId)
        if (!pending) return
        this.pendingFlushes.delete(message.requestId)
        pending.resolve()
        return
      }
      case 'reset-done': {
        this.ready = true
        return
      }
      case 'disposed': {
        this.ready = false
        return
      }
      case 'error': {
        const error = new Error(`Opus worker ${message.phase} error: ${message.message}`)
        if (typeof message.requestId === 'number') {
          const encodePending = this.pendingEncodes.get(message.requestId)
          if (encodePending) {
            this.pendingEncodes.delete(message.requestId)
            encodePending.reject(error)
            return
          }
          const decodePending = this.pendingDecodes.get(message.requestId)
          if (decodePending) {
            this.pendingDecodes.delete(message.requestId)
            decodePending.reject(error)
            return
          }
          const flushPending = this.pendingFlushes.get(message.requestId)
          if (flushPending) {
            this.pendingFlushes.delete(message.requestId)
            flushPending.reject(error)
            return
          }
        }
        logger.error(error.message)
        this.rejectAll(error)
      }
    }
  }

  private rejectAll(error: Error): void {
    this.ready = false
    if (this.pendingInit) {
      this.pendingInit.reject(error)
      this.pendingInit = null
    }
    this.pendingEncodes.forEach(({ reject }) => reject(error))
    this.pendingEncodes.clear()
    this.pendingDecodes.forEach(({ reject }) => reject(error))
    this.pendingDecodes.clear()
    this.pendingFlushes.forEach(({ reject }) => reject(error))
    this.pendingFlushes.clear()
  }
}
