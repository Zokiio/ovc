// WebSocket signaling client for WebRTC

class SignalingClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.authenticated = false;
        this.clientId = null;
        this.reconnectAttempts = 0;
        this.messageHandlers = new Map();
    }
    
    connect(serverHost, port = CONFIG.DEFAULT_SIGNALING_PORT) {
        return new Promise((resolve, reject) => {
            const wsUrl = `ws://${serverHost}:${port}/voice`;
            log.info('Connecting to signaling server:', wsUrl);
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                log.info('WebSocket connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                resolve();
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (error) {
                    log.error('Error parsing message:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                log.error('WebSocket error:', error);
                reject(error);
            };
            
            this.ws.onclose = () => {
                log.info('WebSocket disconnected');
                this.connected = false;
                this.authenticated = false;
                this.handleDisconnect();
            };
        });
    }
    
    authenticate(username) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('Not connected to server'));
                return;
            }
            
            // Register handler for auth response
            this.on('auth_success', (data) => {
                this.authenticated = true;
                this.clientId = data.clientId;
                log.info('Authenticated as:', username, 'Client ID:', this.clientId);
                resolve(data);
            });
            
            this.on('auth_error', (data) => {
                log.error('Authentication failed:', data.message);
                reject(new Error(data.message || 'Authentication failed'));
            });
            
            // Send authentication request
            this.send('authenticate', { username });
        });
    }
    
    send(type, data = {}) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            log.error('Cannot send message: WebSocket not open');
            return false;
        }
        
        const message = {
            type,
            data
        };
        
        log.debug('Sending message:', type, data);
        this.ws.send(JSON.stringify(message));
        return true;
    }
    
    sendMessage(type, data = {}) {
        return this.send(type, data);
    }
    
    sendOffer(sdp) {
        this.send('offer', { sdp, type: 'offer' });
    }
    
    sendIceCandidate(candidate) {
        this.send('ice_candidate', { candidate });
    }
    
    disconnect() {
        if (this.ws) {
            this.send('disconnect');
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.authenticated = false;
        this.clientId = null;
        // Clear message handlers to prevent memory leaks
        this.messageHandlers.clear();
    }
    
    handleMessage(message) {
        const { type, data } = message;
        log.debug('Received message:', type, data);
        
        const handler = this.messageHandlers.get(type);
        if (handler) {
            handler(data);
        }
    }
    
    on(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
    }
    
    handleDisconnect() {
        // Attempt reconnection if enabled
        if (this.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            log.info(`Attempting to reconnect (${this.reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})...`);
            
            setTimeout(() => {
                // Reconnection logic would go here
                // For now, we'll let the user manually reconnect
            }, CONFIG.RECONNECT_DELAY);
        }
    }
    
    isConnected() {
        return this.connected;
    }
    
    isAuthenticated() {
        return this.authenticated;
    }
    
    getClientId() {
        return this.clientId;
    }
}
