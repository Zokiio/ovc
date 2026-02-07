/**
 * AudioWorklet processor for capturing audio data
 * This replaces the deprecated ScriptProcessorNode
 * 
 * Sends audio continuously when active (like old client).
 * VAD UI is for visual feedback only - actual transmission is controlled by app.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isActive = false
    this.frameSize = Math.max(128, Math.round(sampleRate * 0.02)) // ~20ms frames
    this.pending = new Float32Array(this.frameSize * 2)
    this.pendingLength = 0
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'active') {
        this.isActive = event.data.value
        if (!this.isActive) {
          this.pendingLength = 0
        }
      }
    }
    
    // Notify main thread that processor is ready
    this.port.postMessage({ type: 'ready' })
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    
    // Capture audio when active and we have input
    if (input && input.length > 0 && input[0].length > 0 && this.isActive) {
      const source = input[0]
      for (let i = 0; i < source.length; i++) {
        this.pending[this.pendingLength++] = source[i]

        if (this.pendingLength === this.pending.length) {
          const expanded = new Float32Array(this.pending.length * 2)
          expanded.set(this.pending)
          this.pending = expanded
        }
      }

      while (this.pendingLength >= this.frameSize) {
        const audioData = this.pending.slice(0, this.frameSize)

        this.port.postMessage({
          type: 'audioData',
          data: audioData
        }, [audioData.buffer])

        const remaining = this.pendingLength - this.frameSize
        if (remaining > 0) {
          this.pending.copyWithin(0, this.frameSize, this.pendingLength)
        }
        this.pendingLength = remaining
      }
    }
    
    // Return true to keep the processor alive
    return true
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor)
