// Configuration constants for the web client

const CONFIG = {
    // Default server settings
    DEFAULT_SERVER_HOST: 'localhost',
    DEFAULT_SIGNALING_PORT: 24455,
    
    // WebRTC configuration
    RTC_CONFIGURATION: {
        iceServers: [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.cloudflare.com:53' },
        ]
    },
    
    // Audio configuration
    AUDIO: {
        sampleRate: 48000,
        channelCount: 1, // Mono
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    },
    
    // Connection settings
    RECONNECT_DELAY: 3000, // ms
    MAX_RECONNECT_ATTEMPTS: 3,
    
    // Debug mode
    DEBUG: true
};

// Helper function for logging
const log = {
    info: (...args) => CONFIG.DEBUG && console.log('[INFO]', ...args),
    warn: (...args) => CONFIG.DEBUG && console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => CONFIG.DEBUG && console.debug('[DEBUG]', ...args)
};
