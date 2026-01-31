// WebRTC connection manager (RTCPeerConnection + signaling)
//
// MODE:
// - Uses RTCPeerConnection for ICE/DTLS negotiation
// - Sends SDP offer/answer and ICE candidates via WebSocket signaling
// - Audio transport prefers RTCDataChannel when available
// - Falls back to WebSocket proxy audio if DataChannel is not open
//
// NOTE:
// Server-side SCTP/DataChannel handling may be incomplete. This client will
// still stream audio via WebSocket as a fallback to keep audio functional.
import { CONFIG, log } from './config.js';

export class WebRTCManager {
    constructor(signalingClient) {
        this.signaling = signalingClient;
        this.peerConnection = null;
        this.dataChannel = null;
        this.audioStream = null;
        this.isConnected = false;
        this.dataChannelStartRequested = false;
    }
    
    async initialize(mediaStream = null) {
        log.info('Initializing WebRTC peer connection');

        this.audioStream = mediaStream;
        this.peerConnection = new RTCPeerConnection(CONFIG.RTC_CONFIGURATION);

        // Register signaling handlers
        this.registerSignalingHandlers();

        // Create DataChannel for audio (preferred transport)
        this.dataChannel = this.peerConnection.createDataChannel('audio');
        this.setupDataChannelHandlers(this.dataChannel);

        // If server creates a data channel, handle it
        this.peerConnection.ondatachannel = (event) => {
            log.info('Received DataChannel from server:', event.channel.label);
            this.setupDataChannelHandlers(event.channel);
        };

        // Add audio tracks to peer connection if available
        if (this.audioStream) {
            this.audioStream.getTracks().forEach((track) => {
                this.peerConnection.addTrack(track, this.audioStream);
            });
            log.info('Added audio tracks to RTCPeerConnection');
        } else {
            log.warn('No media stream provided; proceeding without audio tracks');
        }

        // ICE candidate handling
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.sendIceCandidate({
                    candidate: event.candidate.candidate,
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
            }
        };

        // Connection state monitoring
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            log.info('Peer connection state:', state);
            this.isConnected = state === 'connected';
            if (window.ui) {
                window.ui.updateConnectionStatus(state, this.isConnected);
            }

            if (state === 'connected' && !this.dataChannelStartRequested) {
                this.dataChannelStartRequested = true;
                if (this.signaling && this.signaling.isConnected()) {
                    this.signaling.sendMessage('start_datachannel', {});
                    log.info('Requested DataChannel transport start (connectionState=connected)');
                }
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            const iceState = this.peerConnection.iceConnectionState;
            log.info('ICE connection state:', iceState);
            
            // In case connectionState never reaches 'connected' (e.g., localhost without full ICE),
            // also trigger start_datachannel when ICE reaches 'connected' or 'completed'
            if ((iceState === 'connected' || iceState === 'completed') && !this.dataChannelStartRequested) {
                this.dataChannelStartRequested = true;
                if (this.signaling && this.signaling.isConnected()) {
                    this.signaling.sendMessage('start_datachannel', {});
                    log.info('Requested DataChannel transport start (iceConnectionState=' + iceState + ')');
                }
            }
        };
        
        // Fallback: send start_datachannel after 3 seconds anyway
        // In localhost/testing, ICE might not complete fully but DTLS can still work
        setTimeout(() => {
            if (!this.dataChannelStartRequested && this.signaling && this.signaling.isConnected()) {
                this.dataChannelStartRequested = true;
                this.signaling.sendMessage('start_datachannel', {});
                log.info('Requested DataChannel transport start (timer fallback after 3s)');
            }
        }, 3000);

        // Create and send SDP offer
        const offer = await this.peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: false
        });
        await this.peerConnection.setLocalDescription(offer);
        this.signaling.sendOffer(offer.sdp);
        log.info('SDP offer sent');

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

    registerSignalingHandlers() {
        this.signaling.on('answer', async (data) => {
            if (!data || !data.sdp) {
                log.warn('Received answer without SDP');
                return;
            }
            try {
                await this.peerConnection.setRemoteDescription({
                    type: 'answer',
                    sdp: data.sdp
                });
                log.info('Remote SDP answer applied');
            } catch (error) {
                log.error('Failed to apply SDP answer:', error);
            }
        });

        this.signaling.on('ice_candidate', async (data) => {
            if (!data || !data.candidate) {
                log.warn('Received ICE candidate without candidate data');
                return;
            }
            try {
                const candidateInit = {
                    candidate: data.candidate,
                    sdpMid: data.sdpMid || null,
                    sdpMLineIndex: typeof data.sdpMLineIndex === 'number' ? data.sdpMLineIndex : null
                };
                await this.peerConnection.addIceCandidate(candidateInit);
                log.debug('Remote ICE candidate added');
            } catch (error) {
                log.error('Failed to add ICE candidate:', error);
            }
        });
    }

    setupDataChannelHandlers(channel) {
        this.dataChannel = channel;
        this.dataChannel.binaryType = 'arraybuffer';
        this.dataChannel.onopen = () => {
            log.info('DataChannel open:', channel.label);
        };
        this.dataChannel.onclose = () => {
            log.warn('DataChannel closed:', channel.label);
        };
        this.dataChannel.onerror = (error) => {
            log.error('DataChannel error:', error);
        };
        this.dataChannel.onmessage = async (event) => {
            if (!window.audioManager) {
                return;
            }

            try {
                let buffer = event.data;
                if (buffer instanceof Blob) {
                    buffer = await buffer.arrayBuffer();
                }
                if (buffer instanceof ArrayBuffer) {
                    window.audioManager.playAudio(buffer);
                }
            } catch (error) {
                log.error('Error processing DataChannel audio:', error);
            }
        };
    }
    
    sendAudioData(audioData) {
        if (!audioData) {
            log.warn('Cannot send audio: Audio data is null or undefined');
            return;
        }

        // Prefer DataChannel if available
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            try {
                // Convert base64 to bytes for binary DataChannel
                const binaryString = atob(audioData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                this.dataChannel.send(bytes.buffer);
                log.debug('Audio packet sent via DataChannel, size:', bytes.length);
                return;
            } catch (error) {
                log.error('Error sending audio via DataChannel:', error.message);
            }
        }

        // Fallback to WebSocket proxy audio if DataChannel not ready
        if (!this.signaling || !this.signaling.isConnected()) {
            log.warn('Cannot send audio: WebSocket not connected and DataChannel not available');
            return;
        }

        try {
            this.signaling.sendMessage('audio', {
                audioData: audioData
            });
            log.debug('Audio packet sent via WebSocket fallback, size:', audioData.length);
        } catch (error) {
            log.error('Error sending audio via WebSocket:', error.message);
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
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        log.info('WebRTC manager disconnected');
    }
    
    isActive() {
        const dataChannelReady = this.dataChannel && this.dataChannel.readyState === 'open';
        const signalingReady = this.signaling && this.signaling.isConnected();
        return dataChannelReady || signalingReady;
    }
}
