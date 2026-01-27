// Audio capture and playback manager

class AudioManager {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        this.isMuted = false;
        this.isActive = false;
    }
    
    async initialize() {
        log.info('Initializing audio system');
        
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: CONFIG.AUDIO.sampleRate,
                    channelCount: CONFIG.AUDIO.channelCount,
                    echoCancellation: CONFIG.AUDIO.echoCancellation,
                    noiseSuppression: CONFIG.AUDIO.noiseSuppression,
                    autoGainControl: CONFIG.AUDIO.autoGainControl
                }
            });
            
            log.info('Microphone access granted');
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: CONFIG.AUDIO.sampleRate
            });
            
            // Create source node from microphone
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create script processor for audio capture
            const bufferSize = 4096;
            this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            
            this.processorNode.onaudioprocess = (event) => {
                if (!this.isMuted && this.isActive) {
                    const inputData = event.inputBuffer.getChannelData(0);
                    this.processAudioInput(inputData);
                }
            };
            
            // Connect nodes
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);
            
            this.isActive = true;
            log.info('Audio system initialized successfully');
            
            return true;
        } catch (error) {
            log.error('Error initializing audio:', error);
            throw new Error('Microphone access denied or not available');
        }
    }
    
    processAudioInput(audioData) {
        // Convert Float32Array to Int16Array for transmission
        // In a real implementation, we would encode with Opus here
        // For now, we'll send PCM data
        
        if (window.webrtcManager && window.webrtcManager.isActive()) {
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
        }
    }
    
    playAudio(audioData) {
        // Play incoming audio from other players
        if (!this.audioContext) {
            return;
        }
        
        try {
            // Convert received data to Float32Array
            const int16Data = new Int16Array(audioData);
            const float32Data = new Float32Array(int16Data.length);
            
            for (let i = 0; i < int16Data.length; i++) {
                float32Data[i] = int16Data[i] / (int16Data[i] < 0 ? 0x8000 : 0x7FFF);
            }
            
            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                1, // mono
                float32Data.length,
                this.audioContext.sampleRate
            );
            
            audioBuffer.getChannelData(0).set(float32Data);
            
            // Create and play buffer source
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();
        } catch (error) {
            log.error('Error playing audio:', error);
        }
    }
    
    mute() {
        this.isMuted = true;
        log.info('Microphone muted');
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
