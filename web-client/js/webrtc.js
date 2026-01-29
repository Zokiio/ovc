// Audio transport manager via WebSocket
// 
// TRANSPORT MODEL (Proxy-based):
// - Audio capture uses Web Audio API (local browser processing)
// - Audio is NOT sent directly to peers via WebRTC peer connections
// - Instead, all audio flows through a central server via WebSocket
// - Server receives audio from all clients and routes it based on proximity/groups
// - This is a server-side proxy model, NOT direct peer-to-peer
//
// WHY NOT WebRTC PEER CONNECTIONS:
// - Simplifies server-side logic (no need for expensive P2P coordination)
// - Ensures consistent audio routing and quality control
// - Works reliably behind NAT/firewalls (no NAT traversal needed)
// - Lower client complexity for browser-based voice chat
//
// SEE ALSO: docs/WEBRTC_ARCHITECTURE.md for architecture details
// and migration path to full RTCPeerConnection if needed in the future
import { log } from './config.js';

export class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.isConnected = false;
    }
    
    async initialize() {
        log.info('Audio transport initialized (WebSocket proxy model - audio routed via server)');
        // WebSocket connection already established by SignalingClient
        this.isConnected = true;
        // Setup audio handler BEFORE marking as ready to avoid race conditions
        this.setupAudioMessageHandler();
        log.info('Audio reception pipeline initialized and ready');
    }
    
    setupAudioMessageHandler() {
        // Listen for incoming audio messages from server
        // Server acts as proxy: receives audio from other clients in same group/proximity
        this.signaling.on('audio', (data) => {
            // Validate audio manager is ready
            if (!window.audioManager) {
                log.warn('Audio manager not initialized yet, dropping audio packet');
                return;
            }
            
            if (!window.audioManager.isReady()) {
                log.warn('Audio manager not ready, dropping audio packet');
                return;
            }
            
            // Validate message structure
            if (!data) {
                log.warn('Received empty audio message');
                return;
            }
            
            if (!data.audioData) {
                log.warn('Invalid audio message - missing audioData field');
                return;
            }
            
            // Validate data is string (base64)
            if (typeof data.audioData !== 'string') {
                log.warn('Audio data is not a string, got type:', typeof data.audioData);
                return;
            }
            
            try {
                const audioDataLength = data.audioData.length;
                log.debug('Audio packet received, size:', audioDataLength);
                
                if (audioDataLength === 0) {
                    log.warn('Audio data is empty');
                    return;
                }
                
                // Decode base64 audio data
                const binaryString = atob(data.audioData);
                const bytes = new Uint8Array(binaryString.length);
                
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                
                // Convert to ArrayBuffer for playAudio()
                const audioBuffer = bytes.buffer;
                
                log.debug('Decoded audio packet: original size:', audioDataLength, 'binary size:', binaryString.length, 'buffer size:', audioBuffer.byteLength);
                window.audioManager.playAudio(audioBuffer);
                
            } catch (error) {
                log.error('Error processing audio packet:', error.message);
                log.debug('Error details:', error, 'data:', data);
            }
        });
        
        log.info('Audio message handler registered with signaling client');
    }
    
    sendAudioData(audioData) {
        if (!this.isConnected) {
            log.warn('Cannot send audio: WebRTC manager not connected');
            return;
        }
        
        if (!this.signaling) {
            log.error('Cannot send audio: Signaling client is null');
            return;
        }
        
        if (!this.signaling.isConnected()) {
            log.warn('Cannot send audio: WebSocket not connected');
            return;
        }
        
        if (!audioData) {
            log.warn('Cannot send audio: Audio data is null or undefined');
            return;
        }
        
        try {
            // Send to server via WebSocket; server proxies to other clients
            this.signaling.sendMessage('audio', {
                audioData: audioData
            });
            log.debug('Audio packet sent to server, size:', audioData.length);
        } catch (error) {
            log.error('Error sending audio:', error.message);
        }
    }
    
    onConnectionEstablished() {
        log.info('WebSocket audio transport connected (server-side proxy)');
        if (window.ui) {
            window.ui.updateConnectionStatus('Connected', true);
        }
    }
    
    onConnectionLost() {
        log.warn('WebSocket audio transport disconnected (server-side proxy)');
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
