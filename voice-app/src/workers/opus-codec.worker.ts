/// <reference lib="webworker" />

type InitMessage = {
  type: 'init'
  sampleRate: number
  channels: number
  targetBitrate: number
  frameDurationMs: number
}

type EncodeMessage = {
  type: 'encode'
  requestId: number
  timestampUs: number
  pcm: ArrayBuffer
}

type DecodeMessage = {
  type: 'decode'
  requestId: number
  timestampUs: number
  durationUs: number
  packet: ArrayBuffer
}

type FlushMessage = {
  type: 'flush'
  requestId: number
}

type ResetMessage = {
  type: 'reset'
}

type DisposeMessage = {
  type: 'dispose'
}

type WorkerRequest =
  | InitMessage
  | EncodeMessage
  | DecodeMessage
  | FlushMessage
  | ResetMessage
  | DisposeMessage

type WorkerEvent =
  | { type: 'ready' }
  | { type: 'encoded'; requestId: number; packet: ArrayBuffer }
  | { type: 'decoded'; requestId: number; pcm: ArrayBuffer; sampleCount: number }
  | { type: 'flushed'; requestId: number }
  | { type: 'reset-done' }
  | { type: 'disposed' }
  | { type: 'error'; requestId?: number; phase: string; message: string }

const scope: DedicatedWorkerGlobalScope = self as DedicatedWorkerGlobalScope

let sampleRate = 48000
let channels = 1
let targetBitrate = 24000

let encoder: AudioEncoder | null = null
let decoder: AudioDecoder | null = null

const encodeRequestByTimestamp = new Map<number, number>()
const decodeRequestByTimestamp = new Map<number, number>()

function postEvent(event: WorkerEvent, transfer: Transferable[] = []): void {
  scope.postMessage(event, transfer)
}

function postError(phase: string, message: string, requestId?: number): void {
  postEvent({
    type: 'error',
    phase,
    message,
    requestId,
  })
}

function teardownCodecs(): void {
  if (encoder) {
    try {
      encoder.close()
    } catch {
      // no-op
    }
    encoder = null
  }
  if (decoder) {
    try {
      decoder.close()
    } catch {
      // no-op
    }
    decoder = null
  }
  encodeRequestByTimestamp.clear()
  decodeRequestByTimestamp.clear()
}

function ensureCodecsInitialized(): boolean {
  if (encoder && decoder) {
    return true
  }

  try {
    encoder = new AudioEncoder({
      output: (chunk: EncodedAudioChunk) => {
        const requestId = encodeRequestByTimestamp.get(chunk.timestamp)
        if (requestId == null) {
          return
        }
        encodeRequestByTimestamp.delete(chunk.timestamp)
        const encoded = new Uint8Array(chunk.byteLength)
        chunk.copyTo(encoded)
        postEvent({ type: 'encoded', requestId, packet: encoded.buffer }, [encoded.buffer])
      },
      error: (error: DOMException) => {
        postError('encode', error.message)
      },
    })

    encoder.configure({
      codec: 'opus',
      sampleRate,
      numberOfChannels: channels,
      bitrate: targetBitrate,
    })

    decoder = new AudioDecoder({
      output: (audioData: AudioData) => {
        const requestId = decodeRequestByTimestamp.get(audioData.timestamp)
        if (requestId == null) {
          audioData.close()
          return
        }
        decodeRequestByTimestamp.delete(audioData.timestamp)
        const sampleCount = audioData.numberOfFrames
        const pcm = new Float32Array(sampleCount)
        try {
          audioData.copyTo(pcm, { planeIndex: 0 })
          postEvent({ type: 'decoded', requestId, pcm: pcm.buffer, sampleCount }, [pcm.buffer])
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to copy decoded PCM data'
          postError('decode-copy', message, requestId)
        } finally {
          audioData.close()
        }
      },
      error: (error: DOMException) => {
        postError('decode', error.message)
      },
    })

    decoder.configure({
      codec: 'opus',
      sampleRate,
      numberOfChannels: channels,
    })

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize Opus codecs'
    postError('init', message)
    teardownCodecs()
    return false
  }
}

async function handleInit(message: InitMessage): Promise<void> {
  sampleRate = message.sampleRate
  channels = message.channels
  targetBitrate = message.targetBitrate
  teardownCodecs()
  if (ensureCodecsInitialized()) {
    postEvent({ type: 'ready' })
  }
}

function handleEncode(message: EncodeMessage): void {
  if (!ensureCodecsInitialized() || !encoder) {
    postError('encode', 'Encoder not initialized', message.requestId)
    return
  }

  try {
    const pcmData = new Float32Array(message.pcm)
    const audioData = new AudioData({
      format: 'f32',
      sampleRate,
      numberOfFrames: pcmData.length,
      numberOfChannels: channels,
      timestamp: message.timestampUs,
      data: pcmData,
    })
    encodeRequestByTimestamp.set(message.timestampUs, message.requestId)
    encoder.encode(audioData)
    audioData.close()
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Failed to encode Opus frame'
    postError('encode', messageText, message.requestId)
  }
}

function handleDecode(message: DecodeMessage): void {
  if (!ensureCodecsInitialized() || !decoder) {
    postError('decode', 'Decoder not initialized', message.requestId)
    return
  }

  try {
    const packet = new Uint8Array(message.packet)
    const chunk = new EncodedAudioChunk({
      type: 'key',
      timestamp: message.timestampUs,
      duration: message.durationUs,
      data: packet,
    })
    decodeRequestByTimestamp.set(message.timestampUs, message.requestId)
    decoder.decode(chunk)
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Failed to decode Opus packet'
    postError('decode', messageText, message.requestId)
  }
}

async function handleFlush(message: FlushMessage): Promise<void> {
  try {
    if (encoder) {
      await encoder.flush()
    }
    if (decoder) {
      await decoder.flush()
    }
    postEvent({ type: 'flushed', requestId: message.requestId })
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Failed to flush codecs'
    postError('flush', messageText, message.requestId)
  }
}

function handleReset(): void {
  teardownCodecs()
  if (ensureCodecsInitialized()) {
    postEvent({ type: 'reset-done' })
  }
}

function handleDispose(): void {
  teardownCodecs()
  postEvent({ type: 'disposed' })
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data
  switch (message.type) {
    case 'init':
      void handleInit(message)
      break
    case 'encode':
      handleEncode(message)
      break
    case 'decode':
      handleDecode(message)
      break
    case 'flush':
      void handleFlush(message)
      break
    case 'reset':
      handleReset()
      break
    case 'dispose':
      handleDispose()
      break
    default:
      postError('worker', 'Unknown worker request')
  }
}

export {}
