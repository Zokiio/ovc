// Audio capture and playback manager
import { CONFIG, log } from './config.js';

export class AudioManager {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.workletNode = null;
        this.sinkNode = null;
        this.processorNode = null;
        this.isMuted = false;
        this.isActive = false;
        
        // Playback buffering for smooth audio rendering
        this.playbackBuffer = null;
        this.playbackBufferSize = 48000 * 2; // 2 seconds at 48kHz
        this.playbackWritePos = 0;
        this.playbackReadPos = 0;
        this.playbackSource = null;
        this.playbackGain = null;
        this.playbackStartTime = null;
        this.isPlaybackInitialized = false;
    }
    
    async initialize() {
        log.info('Initializing audio system');
        
        try {
            // Request microphone access with optimized constraints
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: CONFIG.AUDIO.sampleRate,
                    channelCount: CONFIG.AUDIO.channelCount,
                    echoCancellation: CONFIG.AUDIO.echoCancellation,
                    noiseSuppression: CONFIG.AUDIO.noiseSuppression,
                    autoGainControl: CONFIG.AUDIO.autoGainControl
                    // Note: latencyHint is for AudioContext, not getUserMedia constraints
                }
            });
            
            log.info('Microphone access granted');
            
            // Create audio context with low-latency settings
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: CONFIG.AUDIO.sampleRate,
                latencyHint: 'interactive'  // Minimum latency for real-time audio
            });
            
            // Create source node from microphone
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Load AudioWorklet processor (http/https only). Fallback for file://
            try {
                if (window.location && window.location.protocol === 'file:') {
                    throw new Error('AudioWorklet unavailable on file:// origin');
                }

                await this.audioContext.audioWorklet.addModule('js/audio-worklet-processor.js');
                this.workletNode = new AudioWorkletNode(this.audioContext, 'capture-processor', {
                    processorOptions: {
                        channelCount: CONFIG.AUDIO.channelCount,
                        bufferSize: CONFIG.AUDIO.bufferSize || 512  // Use config value (lower = less latency)
                    }
                });
                
                // Mute monitoring by routing to a silent gain node
                this.sinkNode = this.audioContext.createGain();
                this.sinkNode.gain.value = 0;
                
                this.workletNode.port.onmessage = (event) => {
                    if (!this.isMuted && this.isActive) {
                        const inputData = event.data && event.data.samples;
                        if (inputData && inputData.length > 0) {

                            this.processAudioInput(inputData);
                        }
                    }
                };
                
                // Connect nodes
                this.sourceNode.connect(this.workletNode);
                this.workletNode.connect(this.sinkNode);
                this.sinkNode.connect(this.audioContext.destination);
            } catch (error) {
                log.warn('AudioWorklet module failed to load. Falling back to ScriptProcessorNode. Serve the app over http(s) to enable AudioWorklet. Error:', error.message);
                // Fallback to deprecated ScriptProcessorNode for file:// usage
                const bufferSize = 4096;
                this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
                this.processorNode.onaudioprocess = (event) => {
                    if (!this.isMuted && this.isActive) {
                        const inputData = event.inputBuffer.getChannelData(0);
                        this.processAudioInput(inputData);
                    }
                };
                this.sourceNode.connect(this.processorNode);
                this.processorNode.connect(this.audioContext.destination);
            }
            
            this.isActive = true;
            log.info('Audio system initialized successfully');
            
            return true;
        } catch (error) {
            log.error('Error initializing audio:', error);
            throw new Error('Microphone access denied or not available');
        }
    }
    
        getMediaStream() {
            return this.mediaStream;
        }
    
    processAudioInput(audioData) {
        // Convert Float32Array to Int16Array for transmission
        // In a real implementation, we would encode with Opus here
        // For now, we'll send PCM data
        
        if (!window.webrtcManager) {
            log.warn('WebRTC manager not available, cannot send audio');
            return;
        }
        
        if (!window.webrtcManager.isActive()) {
            log.warn('WebRTC manager not active, cannot send audio');
            return;
        }
        
        try {
            // Convert float samples to int16
            const int16Data = new Int16Array(audioData.length);
            for (let i = 0; i < audioData.length; i++) {
                const s = Math.max(-1, Math.min(1, audioData[i]));
                int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            // Encode as base64 for transmission
            const uint8Data = new Uint8Array(int16Data.buffer);
            const binaryString = String.fromCharCode(...uint8Data);
            const base64Data = btoa(binaryString);
            
            // Send audio data via WebSocket
            window.webrtcManager.sendAudioData(base64Data);
        } catch (error) {
            log.error('Error processing audio input:', error.message);
        }
    }
    
    playAudio(audioData) {
        // Play incoming audio from other players using a continuous buffer
        if (!this.audioContext) {
            log.warn('Audio context not initialized, cannot play audio');
            return;
        }
        
        try {
            log.debug('playAudio called with buffer size:', audioData.byteLength);
            
            // Initialize playback buffer on first audio
            if (!this.isPlaybackInitialized) {
                this.initializePlaybackBuffer();
            }
            
            // Convert received data to Float32Array
            const int16Data = new Int16Array(audioData);
            log.debug('Int16 samples:', int16Data.length);
            
            // Write audio data to ring buffer
            this.writeToPlaybackBuffer(int16Data);
            
            log.info('Audio buffered, duration:', (int16Data.length / this.audioContext.sampleRate).toFixed(3), 'seconds');
        } catch (error) {
            log.error('Error playing audio:', error, 'audioData:', audioData);
        }
    }
    
    initializePlaybackBuffer() {
        if (this.isPlaybackInitialized) {
            return;
        }
        
        log.info('Initializing continuous playback buffer');
        
        // Create ring buffer for audio samples
        this.playbackBuffer = new Float32Array(this.playbackBufferSize);
        this.playbackWritePos = 0;
        this.playbackReadPos = 0;
        
        // Create a continuous audio source
        // Use a ScriptProcessorNode or AudioWorklet to pull from buffer
        try {
            // Try to use AudioWorklet first (preferred)
            // For now, we'll use ScriptProcessorNode as fallback for Web Audio simplicity
            const bufferSize = 4096; // ~85ms at 48kHz
            this.playbackProcessor = this.audioContext.createScriptProcessor(bufferSize, 0, 1);
            
            this.playbackProcessor.onaudioprocess = (event) => {
                const output = event.outputBuffer.getChannelData(0);
                
                // Fill output buffer from ring buffer
                for (let i = 0; i < output.length; i++) {
                    if (this.playbackReadPos < this.playbackWritePos) {
                        output[i] = this.playbackBuffer[this.playbackReadPos % this.playbackBufferSize];
                        this.playbackReadPos++;
                    } else {
                        // No more audio available, output silence
                        output[i] = 0;
                    }
                }
            };
        this.isPlaybackInitialized = false;
        
        if (this.playbackProcessor) {
            this.playbackProcessor.disconnect();
            this.playbackProcessor = null;
        }
        
        if (this.workletNode) {
            this.workletNode.port.onmessage = null;
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        
        if (this.sinkNode) {
            this.sinkNode.disconnect();
            this.sinkNode = null;
        }

        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }
        
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        this.playbackBuffer = null;og.info('Microphone muted');
    }
    
    unmute() {
        this.isMuted = false;
        log.info('Microphone unmuted');
    }
    
    toggleMute() {
        if (this.isMuted) {
            this.unmute();
        } else {
            this.mute();
        }
        return this.isMuted;
    }
    
    stop() {
        this.isActive = false;
        
        if (this.workletNode) {
            this.workletNode.port.onmessage = null;
            this.workletNode.disconnect();
            this.workletNode = null;
        }
        
        if (this.sinkNode) {
            this.sinkNode.disconnect();
            this.sinkNode = null;
        }

        if (this.processorNode) {
            this.processorNode.disconnect();
            this.processorNode = null;
        }
        
        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        log.info('Audio system stopped');
    }
    
    isReady() {
        return this.isActive && this.audioContext && this.mediaStream;
    }
}
