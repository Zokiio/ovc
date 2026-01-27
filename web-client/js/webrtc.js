// Audio transport manager via WebSocket
// WebRTC is used only for local audio capture, not for peer connection

class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.isConnected = false;
    }
    
    async initialize() {
        log.info('WebRTC audio transport ready (via WebSocket)');
        // WebSocket connection already established by SignalingClient
        this.isConnected = true;
        this.setupAudioMessageHandler();
    }
    
    setupAudioMessageHandler() {
        // Listen for incoming audio messages from server
        this.signaling.on('audio', (data) => {
            if (window.audioManager && data.audioData) {
                try {
                    // Decode base64 audio data
                    const binaryString = atob(data.audioData);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    // Convert to Int16Array for playAudio()
                    const audioBuffer = bytes.buffer;
                    window.audioManager.playAudio(audioBuffer);
                    log.debug('Playing received audio from remote client');
                } catch (error) {
                    log.error('Error decoding received audio:', error);
                }
            }
        });
    }
    
    /**
     * Send audio data to server via WebSocket signaling channel
     * Audio frames should be PCM Int16Array converted to ArrayBuffer
     */
    sendAudioData(audioData) {
        if (this.isConnected && this.signaling && this.signaling.isConnected()) {
            this.signaling.sendMessage('audio', {
                audioData: audioData
            });
        } else {
            log.warn('Cannot send audio: WebSocket not connected');
        }
    }
    
    onConnectionEstablished() {
        log.info('WebSocket audio transport connected');
        if (window.ui) {
            window.ui.updateConnectionStatus('Connected', true);
        }
    }
    
    onConnectionLost() {
        log.warn('WebSocket audio transport disconnected');
        if (window.ui) {
            window.ui.updateConnectionStatus('Disconnected', false);
        }
    }
    
    disconnect() {
        this.isConnected = false;
        log.info('WebRTC manager disconnected');
    }
    
    isActive() {
        return this.isConnected && this.signaling && this.signaling.isConnected();
    }
}
