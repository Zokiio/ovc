// AudioWorklet processor for capturing microphone audio

class CaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const processorOptions = (options && options.processorOptions) || {};
        this.channelCount = Math.max(1, processorOptions.channelCount || 1);
        this.bufferSize = Math.max(128, processorOptions.bufferSize || 1024);
        this.writeIndex = 0;
        this.buffer = new Float32Array(this.bufferSize);
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0] || input[0].length === 0) {
            return true;
        }

        const channelData = input[0];
        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.writeIndex++] = channelData[i];

            if (this.writeIndex >= this.bufferSize) {
                // Send a copy to avoid transferring the internal buffer
                this.port.postMessage({ samples: new Float32Array(this.buffer) });
                this.writeIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('capture-processor', CaptureProcessor);
