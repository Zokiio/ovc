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
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'active') {
        this.isActive = event.data.value
      }
    }
    
    // Notify main thread that processor is ready
    this.port.postMessage({ type: 'ready' })
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    
    // Capture audio when active and we have input
    if (input && input.length > 0 && input[0].length > 0 && this.isActive) {
      // input[0] is already a Float32Array for the first channel
      // Clone it since we can't transfer the original buffer
      const audioData = input[0].slice()
      
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
