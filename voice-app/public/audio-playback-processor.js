class AudioPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    const bufferSize = options?.processorOptions?.bufferSize
    const defaultSize = Math.floor(sampleRate * 2) // 2 seconds at current sample rate
    this.playbackBufferSize = Math.max(1, bufferSize || defaultSize)
    this.playbackBuffer = new Float32Array(this.playbackBufferSize)
    this.playbackWritePos = 0
    this.playbackReadPos = 0

    this.port.onmessage = (event) => {
      const message = event.data
      if (!message || !message.type) {
        return
      }

      if (message.type === 'samples' && message.data) {
        this.writeSamples(message.data)
      } else if (message.type === 'reset') {
        this.playbackWritePos = 0
        this.playbackReadPos = 0
        this.playbackBuffer.fill(0)
      }
    }
  }

  writeSamples(float32Data) {
    if (!float32Data || !float32Data.length) {
      return
    }

    for (let i = 0; i < float32Data.length; i++) {
      this.playbackBuffer[this.playbackWritePos % this.playbackBufferSize] = float32Data[i]
      this.playbackWritePos++
    }

    const bufferFill = this.playbackWritePos - this.playbackReadPos
    if (bufferFill > this.playbackBufferSize * 0.95) {
      this.playbackReadPos = this.playbackWritePos - Math.floor(this.playbackBufferSize * 0.5)
    }
  }

  process(inputs, outputs) {
    const output = outputs[0]
    if (!output || output.length === 0) {
      return true
    }

    const channel = output[0]
    for (let i = 0; i < channel.length; i++) {
      if (this.playbackReadPos < this.playbackWritePos) {
        channel[i] = this.playbackBuffer[this.playbackReadPos % this.playbackBufferSize]
        this.playbackReadPos++
      } else {
        channel[i] = 0
      }
    }

    return true
  }
}

registerProcessor('audio-playback-processor', AudioPlaybackProcessor)
