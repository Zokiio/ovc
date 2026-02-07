class AudioPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()

    const bufferSize = options?.processorOptions?.bufferSize
    const defaultSize = Math.floor(sampleRate * 2) // 2 seconds at current sample rate
    this.playbackBufferSize = Math.max(1, bufferSize || defaultSize)
    this.playbackBuffer = new Float32Array(this.playbackBufferSize)
    this.playbackWritePos = 0
    this.playbackReadPos = 0
    this.prebufferSamples = Math.max(128, Math.round(sampleRate * 0.06)) // 60ms minimum
    this.isPrimed = false

    this.underruns = 0
    this.overruns = 0
    this.droppedSamples = 0
    this.lastFrameSize = 0
    this.callbacksSinceReport = 0
    this.reportIntervalCallbacks = Math.max(1, Math.round(sampleRate / 128))

    this.port.onmessage = (event) => {
      const message = event.data
      if (!message || !message.type) {
        return
      }

      if (message.type === 'samples' && message.data) {
        this.writeSamples(message.data)
      } else if (message.type === 'reset') {
        this.reset()
      }
    }
  }

  reset() {
    this.playbackWritePos = 0
    this.playbackReadPos = 0
    this.playbackBuffer.fill(0)
    this.isPrimed = false
    this.underruns = 0
    this.overruns = 0
    this.droppedSamples = 0
    this.lastFrameSize = 0
  }

  writeSamples(float32Data) {
    if (!float32Data || !float32Data.length) {
      return
    }

    this.lastFrameSize = float32Data.length

    for (let i = 0; i < float32Data.length; i++) {
      this.playbackBuffer[this.playbackWritePos % this.playbackBufferSize] = float32Data[i]
      this.playbackWritePos++
    }

    const bufferFill = this.playbackWritePos - this.playbackReadPos
    if (bufferFill > this.playbackBufferSize * 0.95) {
      this.overruns++
      const targetFill = Math.floor(this.playbackBufferSize * 0.5)
      const dropped = Math.max(0, bufferFill - targetFill)
      this.droppedSamples += dropped
      this.playbackReadPos = this.playbackWritePos - targetFill
      this.isPrimed = true
    }
  }

  emitDiagnostics() {
    this.port.postMessage({
      type: 'diagnostics',
      data: {
        underruns: this.underruns,
        overruns: this.overruns,
        droppedSamples: this.droppedSamples,
        lastFrameSize: this.lastFrameSize,
        bufferedSamples: Math.max(0, this.playbackWritePos - this.playbackReadPos),
      },
    })
  }

  process(inputs, outputs) {
    const output = outputs[0]
    if (!output || output.length === 0) {
      return true
    }

    const channel = output[0]
    const availableBeforeWrite = this.playbackWritePos - this.playbackReadPos

    if (!this.isPrimed && availableBeforeWrite < this.prebufferSamples) {
      channel.fill(0)
    } else {
      this.isPrimed = true
      let hadUnderrun = false
      for (let i = 0; i < channel.length; i++) {
        if (this.playbackReadPos < this.playbackWritePos) {
          const sample = this.playbackBuffer[this.playbackReadPos % this.playbackBufferSize]
          channel[i] = sample
          this.playbackReadPos++
        } else {
          channel[i] = 0
          hadUnderrun = true
        }
      }

      if (hadUnderrun) {
        this.underruns++
        this.isPrimed = false
      }
    }

    this.callbacksSinceReport++
    if (this.callbacksSinceReport >= this.reportIntervalCallbacks) {
      this.callbacksSinceReport = 0
      this.emitDiagnostics()
    }

    return true
  }
}

registerProcessor('audio-playback-processor', AudioPlaybackProcessor)
