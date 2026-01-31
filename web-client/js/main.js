// Main application entry point
import { CONFIG, log } from './config.js';
import { SignalingClient } from './signaling.js';
import { WebRTCManager } from './webrtc.js';
import { AudioManager } from './audio.js';
import { UIManager } from './ui.js';

class VoiceChatApp {
    constructor() {
        this.signalingClient = null;
        this.webrtcManager = null;
        this.audioManager = null;
        this.connected = false;
    }
    
    async connect(username, serverHost) {
        log.info('Starting connection process...');
        
        try {
            // Initialize components
            this.signalingClient = new SignalingClient();
            this.audioManager = new AudioManager();
            this.webrtcManager = new WebRTCManager(this.signalingClient);
            
            // Make managers globally accessible
            window.audioManager = this.audioManager;
            window.webrtcManager = this.webrtcManager;
            
            // Step 1: Connect to signaling server
            log.info('Step 1: Connecting to signaling server...');
            await this.signalingClient.connect(serverHost);
            
            // Step 2: Authenticate
            log.info('Step 2: Authenticating...');
            await this.signalingClient.authenticate(username);
            
            // Step 3: Initialize audio
            log.info('Step 3: Initializing audio...');
            await this.audioManager.initialize();
            
            // Step 4: Setup WebRTC connection
            log.info('Step 4: Setting up WebRTC...');
            await this.webrtcManager.initialize(this.audioManager.getMediaStream());
            
            this.connected = true;
            log.info('Successfully connected to voice chat!');
            
        } catch (error) {
            log.error('Connection failed:', error);
            this.cleanup();
            throw error;
        }
    }
    
    disconnect() {
        log.info('Disconnecting from voice chat...');
        this.cleanup();
        this.connected = false;
    }
    
    cleanup() {
        if (this.audioManager) {
            this.audioManager.stop();
            this.audioManager = null;
        }
        
        if (this.webrtcManager) {
            this.webrtcManager.disconnect();
            this.webrtcManager = null;
        }
        
        if (this.signalingClient) {
            this.signalingClient.disconnect();
            this.signalingClient = null;
        }
        
        window.audioManager = null;
        window.webrtcManager = null;
    }
    
    isConnected() {
        return this.connected;
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    log.info('Hytale Voice Chat Web Client starting...');
    
    // Check browser compatibility
    if (!checkBrowserCompatibility()) {
        return;
    }
    
    // Initialize UI manager
    window.ui = new UIManager();
    
    // Initialize app
    window.app = new VoiceChatApp();
    
    // Set default server if localhost
    const serverInput = document.getElementById('server');
    if (!serverInput.value) {
        serverInput.value = CONFIG.DEFAULT_SERVER_HOST;
    }
    
    log.info('Application initialized and ready');
});

function checkBrowserCompatibility() {
    const required = {
        'WebRTC': window.RTCPeerConnection,
        'WebSocket': window.WebSocket,
        'Web Audio': window.AudioContext || window.webkitAudioContext,
        'AudioWorklet': window.AudioWorkletNode,
        'getUserMedia': navigator.mediaDevices && navigator.mediaDevices.getUserMedia
    };
    
    const missing = [];
    for (const [name, feature] of Object.entries(required)) {
        if (!feature) {
            missing.push(name);
        }
    }
    
    if (missing.length > 0) {
        const error = `Your browser is missing required features: ${missing.join(', ')}. ` +
                     `Please use a modern browser like Chrome, Firefox, or Edge.`;
        alert(error);
        log.error(error);
        return false;
    }
    
    log.info('Browser compatibility check passed');
    return true;
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.app && window.app.isConnected()) {
        window.app.disconnect();
    }
});
