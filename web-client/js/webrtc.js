// WebRTC connection manager

class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.peerConnection = null;
        this.dataChannel = null;
        this.isConnected = false;
    }
    
    async initialize() {
        log.info('Initializing WebRTC connection');
        
        // Create RTCPeerConnection
        this.peerConnection = new RTCPeerConnection(CONFIG.RTC_CONFIGURATION);
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Create data channel for audio
        this.dataChannel = this.peerConnection.createDataChannel('audio', {
            ordered: false, // Don't wait for retransmissions
            maxRetransmits: 0
        });
        
        this.setupDataChannel();
        
        // Create and send offer
        await this.createOffer();
    }
    
    setupEventHandlers() {
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                log.debug('New ICE candidate:', event.candidate);
                this.signaling.sendIceCandidate(event.candidate);
            }
        };
        
        this.peerConnection.oniceconnectionstatechange = () => {
            log.info('ICE connection state:', this.peerConnection.iceConnectionState);
            
            if (this.peerConnection.iceConnectionState === 'connected' || 
                this.peerConnection.iceConnectionState === 'completed') {
                this.isConnected = true;
                this.onConnectionEstablished();
            } else if (this.peerConnection.iceConnectionState === 'disconnected' ||
                       this.peerConnection.iceConnectionState === 'failed' ||
                       this.peerConnection.iceConnectionState === 'closed') {
                this.isConnected = false;
                this.onConnectionLost();
            }
        };
        
        this.peerConnection.ondatachannel = (event) => {
            log.info('Data channel received from server');
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
        
        // Handle incoming answer from server
        this.signaling.on('answer', async (data) => {
            log.info('Received SDP answer from server');
            try {
                await this.peerConnection.setRemoteDescription({
                    type: 'answer',
                    sdp: data.sdp
                });
                log.info('Remote description set successfully');
            } catch (error) {
                log.error('Error setting remote description:', error);
            }
        });
        
        // Handle incoming ICE candidates from server
        this.signaling.on('ice_candidate', async (data) => {
            try {
                await this.peerConnection.addIceCandidate(data.candidate);
                log.debug('Added ICE candidate');
            } catch (error) {
                log.error('Error adding ICE candidate:', error);
            }
        });
    }
    
    setupDataChannel() {
        this.dataChannel.onopen = () => {
            log.info('Data channel opened');
        };
        
        this.dataChannel.onclose = () => {
            log.info('Data channel closed');
        };
        
        this.dataChannel.onerror = (error) => {
            log.error('Data channel error:', error);
        };
        
        this.dataChannel.onmessage = (event) => {
            // Handle incoming audio data
            this.onAudioDataReceived(event.data);
        };
    }
    
    async createOffer() {
        try {
            // Create offer with audio constraints
            const offer = await this.peerConnection.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: false
            });
            
            await this.peerConnection.setLocalDescription(offer);
            log.info('Created and set local offer');
            
            // Send offer to server via signaling
            this.signaling.sendOffer(offer.sdp);
        } catch (error) {
            log.error('Error creating offer:', error);
            throw error;
        }
    }
    
    sendAudioData(audioData) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(audioData);
        } else {
            log.warn('Cannot send audio: data channel not open');
        }
    }
    
    onAudioDataReceived(data) {
        // This will be handled by the AudioManager
        if (window.audioManager) {
            window.audioManager.playAudio(data);
        }
    }
    
    onConnectionEstablished() {
        log.info('WebRTC connection established');
        if (window.ui) {
            window.ui.updateConnectionStatus('Connected', true);
        }
    }
    
    onConnectionLost() {
        log.warn('WebRTC connection lost');
        if (window.ui) {
            window.ui.updateConnectionStatus('Disconnected', false);
        }
    }
    
    disconnect() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        
        this.isConnected = false;
    }
    
    isActive() {
        return this.isConnected && this.dataChannel && this.dataChannel.readyState === 'open';
    }
}
