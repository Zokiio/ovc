// UI event handlers and updates

class UIManager {
    constructor() {
        this.elements = {
            connectionPanel: document.getElementById('connection-panel'),
            voicePanel: document.getElementById('voice-panel'),
            errorPanel: document.getElementById('error-panel'),
            connectForm: document.getElementById('connect-form'),
            usernameInput: document.getElementById('username'),
            serverInput: document.getElementById('server'),
            connectBtn: document.getElementById('connect-btn'),
            muteBtn: document.getElementById('mute-btn'),
            disconnectBtn: document.getElementById('disconnect-btn'),
            dismissErrorBtn: document.getElementById('dismiss-error-btn'),
            connectionStatus: document.getElementById('connection-status'),
            micStatus: document.getElementById('mic-status'),
            userDisplay: document.getElementById('user-display'),
            errorMessage: document.getElementById('error-message')
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        this.elements.connectForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleConnect();
        });
        
        this.elements.muteBtn.addEventListener('click', () => {
            this.handleMuteToggle();
        });
        
        this.elements.disconnectBtn.addEventListener('click', () => {
            this.handleDisconnect();
        });
        
        this.elements.dismissErrorBtn.addEventListener('click', () => {
            this.hideError();
        });
    }
    
    async handleConnect() {
        const username = this.elements.usernameInput.value.trim();
        const server = this.elements.serverInput.value.trim();
        
        if (!username || !server) {
            this.showError('Please enter both username and server address');
            return;
        }
        
        this.setConnecting(true);
        
        try {
            await window.app.connect(username, server);
            this.showVoicePanel(username);
        } catch (error) {
            this.showError(error.message || 'Connection failed');
            this.setConnecting(false);
        }
    }
    
    handleMuteToggle() {
        if (window.audioManager) {
            const isMuted = window.audioManager.toggleMute();
            this.updateMuteButton(isMuted);
        }
    }
    
    handleDisconnect() {
        if (window.app) {
            window.app.disconnect();
        }
        this.showConnectionPanel();
    }
    
    setConnecting(isConnecting) {
        this.elements.connectBtn.disabled = isConnecting;
        this.elements.connectBtn.textContent = isConnecting ? 'Connecting...' : 'Connect';
        
        if (isConnecting) {
            this.elements.connectBtn.classList.add('loading');
        } else {
            this.elements.connectBtn.classList.remove('loading');
        }
    }
    
    showConnectionPanel() {
        this.elements.connectionPanel.classList.remove('hidden');
        this.elements.voicePanel.classList.add('hidden');
        this.updateConnectionStatus('Disconnected', false);
        this.updateMicStatus('Inactive', false);
        // Re-enable connect button
        this.setConnecting(false);
    }
    
    showVoicePanel(username) {
        this.elements.connectionPanel.classList.add('hidden');
        this.elements.voicePanel.classList.remove('hidden');
        this.elements.userDisplay.textContent = username;
        this.updateConnectionStatus('Connected', true);
        this.updateMicStatus('Active', true);
    }
    
    updateConnectionStatus(status, isConnected) {
        this.elements.connectionStatus.textContent = status;
        this.elements.connectionStatus.className = 'status-value ' + 
            (isConnected ? 'status-connected' : 'status-disconnected');
    }
    
    updateMicStatus(status, isActive) {
        this.elements.micStatus.textContent = status;
        this.elements.micStatus.className = 'status-value ' + 
            (isActive ? 'status-active' : 'status-inactive');
    }
    
    updateMuteButton(isMuted) {
        if (isMuted) {
            this.elements.muteBtn.textContent = '🔇 Unmute';
            this.updateMicStatus('Muted', false);
        } else {
            this.elements.muteBtn.textContent = '🎤 Mute';
            this.updateMicStatus('Active', true);
        }
    }
    
    showError(message) {
        this.elements.errorMessage.textContent = message;
        this.elements.errorPanel.classList.remove('hidden');
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            this.hideError();
        }, 10000);
    }
    
    hideError() {
        this.elements.errorPanel.classList.add('hidden');
    }
}
