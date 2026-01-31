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
    this.frameCount = 0
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'active') {
        const wasActive = this.isActive
        this.isActive = event.data.value
        // Send status back to main thread (worklet console.log doesn't show in browser)
        this.port.postMessage({
          type: 'status',
          message: `Active changed: ${wasActive} -> ${this.isActive}`
        })
      }
    }
    
    // Notify main thread that processor is ready
    this.port.postMessage({ type: 'ready' })
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    
    // Capture audio when active and we have input
    if (input && input.length > 0 && input[0].length > 0 && this.isActive) {
      // Clone the data since we can't transfer the original buffer
      const audioData = new Float32Array(input[0])
      
      // Send status every 100 frames (~2 seconds at 48kHz/128 samples)
      this.frameCount++
      if (this.frameCount % 100 === 0) {
        this.port.postMessage({
          type: 'status',
          message: `Captured ${this.frameCount} frames`
        })
      }
      
      // Send to main thread
      this.port.postMessage({
        type: 'audioData',
        data: audioData
      }, [audioData.buffer])
    }
    
    // Return true to keep the processor alive
    return true
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor)
