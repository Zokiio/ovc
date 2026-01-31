/**
 * AudioWorklet processor for capturing audio data
 * This replaces the deprecated ScriptProcessorNode
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.isSpeaking = false
    
    // Listen for messages from main thread
    this.port.onmessage = (event) => {
      if (event.data.type === 'speaking') {
        this.isSpeaking = event.data.value
      }
    }
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]
    
    // Only capture when we have input and user is speaking
    if (input && input.length > 0 && input[0].length > 0 && this.isSpeaking) {
      // Clone the data since we can't transfer the original buffer
      const audioData = new Float32Array(input[0])
      
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
