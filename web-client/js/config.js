// Configuration constants for the web client

export const CONFIG = {
    // Default server settings
    DEFAULT_SERVER_HOST: '192.168.1.180',
    DEFAULT_SIGNALING_PORT: 24455,
    
    // WebRTC configuration
    RTC_CONFIGURATION: {
        iceServers: [
            { urls: 'stun:stun.cloudflare.com:3478' },
            { urls: 'stun:stun.cloudflare.com:53' },
        ]
    },
    
    // Audio configuration (optimized for low-latency voice chat)
    AUDIO: {
        sampleRate: 48000,          // Opus native rate (best quality)
        channelCount: 1,            // Mono (voice chat standard)
        echoCancellation: true,     // Prevent feedback loops
        noiseSuppression: true,     // Remove background noise
        autoGainControl: true,      // Normalize volume levels
        bufferSize: 512             // Lower buffer = lower latency (10.7ms @ 48kHz)
    },
    
    // Proximity voice chat settings
    PROXIMITY: {
        maxDistance: 30.0,          // Maximum hearing distance (blocks)
        fadeStart: 20.0,            // Distance where volume starts fading (blocks)
        rolloffFactor: 1.5          // How quickly volume decreases with distance
    },
    
    // Connection settings
    RECONNECT_DELAY: 3000, // ms
    MAX_RECONNECT_ATTEMPTS: 3,

    // Signaling connection
    SIGNALING: {
        USE_VITE_PROXY_ON_HTTPS: true,
        PROXY_PATH: '/voice'
    },
    
    // Debug mode
    DEBUG: true
};

// Helper function for logging
export const log = {
    info: (...args) => CONFIG.DEBUG && console.log('[INFO]', ...args),
    warn: (...args) => CONFIG.DEBUG && console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    debug: (...args) => CONFIG.DEBUG && console.debug('[DEBUG]', ...args)
};
