/**
 * AudioWorklet processor for capturing audio data
 * This replaces the deprecated ScriptProcessorNode
 * 
 * Sends audio continuously when active (like old client).
 * VAD UI is for visual feedback only - actual transmission is controlled by app.
 * 
 * Batches render quanta into 384-sample frames to reduce packet rate.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isActive = false
    this.targetFrameSamples = 384
    this.maxPendingSamples = this.targetFrameSamples * 16
    this.maxPendingFramesBeforeFlush = 8
    this.pendingSamples = new Float32Array(this.maxPendingSamples)
    this.pendingLength = 0
    this.pendingFrameCount = 0
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'active') {
        this.isActive = event.data.value
        if (!this.isActive) {
          this.pendingLength = 0
          this.pendingFrameCount = 0
        }
      }
    }
    
    // Notify main thread that processor is ready
    this.port.postMessage({ type: 'ready' })
  }

  appendSamples(samples) {
    if (!samples || samples.length === 0) {
      return
    }

    const capacity = this.pendingSamples.length
    if (samples.length >= capacity) {
      this.pendingSamples.set(samples.subarray(samples.length - capacity), 0)
      this.pendingLength = capacity
      return
    }

    const requiredLength = this.pendingLength + samples.length
    if (requiredLength > capacity) {
      const dropCount = requiredLength - capacity
      this.pendingSamples.copyWithin(0, dropCount, this.pendingLength)
      this.pendingLength -= dropCount
    }

    this.pendingSamples.set(samples, this.pendingLength)
    this.pendingLength += samples.length
  }

  emitSamples(sampleCount) {
    if (sampleCount <= 0 || this.pendingLength < sampleCount) {
      return
    }

    const audioData = this.pendingSamples.slice(0, sampleCount)
    this.port.postMessage({
      type: 'audioData',
      data: audioData
    }, [audioData.buffer])

    if (this.pendingLength > sampleCount) {
      this.pendingSamples.copyWithin(0, sampleCount, this.pendingLength)
    }
    this.pendingLength -= sampleCount
    this.pendingFrameCount = 0
  }

  drainCompleteFrames() {
    while (this.pendingLength >= this.targetFrameSamples) {
      this.emitSamples(this.targetFrameSamples)
    }
  }

  flushRemainderIfStale() {
    if (this.pendingLength > 0 && this.pendingFrameCount >= this.maxPendingFramesBeforeFlush) {
      this.emitSamples(this.pendingLength)
    }
  }

  process(inputs) {
    const input = inputs[0]
    
    // Capture audio when active and we have input
    if (input && input.length > 0 && input[0].length > 0 && this.isActive) {
      this.appendSamples(input[0])
      this.pendingFrameCount++
      this.drainCompleteFrames()
      this.flushRemainderIfStale()
    }
    
    // Return true to keep the processor alive
    return true
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor)
