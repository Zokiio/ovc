package com.hytale.voicechat.common.network;

/**
 * Configuration for voice chat networking (WebRTC SFU)
 * Values can be set via Hytale config system or legacy VoiceConfig fallback
 */
public class NetworkConfig {
    // Signaling server port (configurable)
    private static int signalingPort = 24455;
    
    // SSL/TLS configuration
    private static boolean enableSSL = false;
    private static String sslCertPath = "/etc/letsencrypt/live/hytale.techynoodle.com/fullchain.pem";
    private static String sslKeyPath = "/etc/letsencrypt/live/hytale.techynoodle.com/privkey.pem";
    
    // CORS allowed origins
    private static String allowedOrigins = "https://hytale.techynoodle.com,https://voice.techynoodle.com,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173";
    
    // Legacy fallback to custom VoiceConfig for backward compatibility
    static {
        try {
            // Try HOCON-style property names first (from ovc.conf)
            signalingPort = com.hytale.voicechat.common.config.VoiceConfig.getInt("SignalingPort", signalingPort);
            enableSSL = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("EnableSSL", enableSSL);
            sslCertPath = com.hytale.voicechat.common.config.VoiceConfig.getString("SSLCertPath", sslCertPath);
            sslKeyPath = com.hytale.voicechat.common.config.VoiceConfig.getString("SSLKeyPath", sslKeyPath);
            allowedOrigins = com.hytale.voicechat.common.config.VoiceConfig.getString("AllowedOrigins", allowedOrigins);
            
            // Fallback to old property names for backward compatibility
            signalingPort = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.signaling.port", signalingPort);
            enableSSL = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.ssl.enabled", enableSSL);
            sslCertPath = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.ssl.cert", sslCertPath);
            sslKeyPath = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.ssl.key", sslKeyPath);
            allowedOrigins = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.allowed.origins", allowedOrigins);
        } catch (Exception e) {
            System.err.println("[NetworkConfig] Failed to load VoiceConfig: " + e.getMessage());
        }
    }
    
    public static final int DEFAULT_SAMPLE_RATE = 48000;
    public static final int FRAME_DURATION_MS = 20;
    public static final int FRAME_SIZE = 960; // 20ms at 48kHz
    public static final int[] SUPPORTED_SAMPLE_RATES = {8000, 12000, 16000, 24000, 48000};
    public static final int MAX_PACKET_SIZE = 1024;
    
    // Voice chat proximity settings (in blocks)
    public static final double DEFAULT_PROXIMITY_DISTANCE = 30.0;  // Max hearing distance
    public static final double PROXIMITY_FADE_START = 20.0;        // Distance where volume fade begins
    public static final double PROXIMITY_ROLLOFF_FACTOR = 1.5;     // Volume decrease rate (1.0=linear, 2.0=quadratic)
    public static final double MAX_VOICE_DISTANCE = 100.0;
    
    // Group management limits
    public static final int MAX_GROUP_NAME_LENGTH = 32;
    public static final int MAX_GROUP_MEMBER_COUNT = 200;
    public static final int MAX_GROUP_COUNT = 100;
    
    // Group isolation mode default
    public static final boolean DEFAULT_GROUP_IS_ISOLATED = true;

    private NetworkConfig() {
        // Utility class
    }
    
    /**
     * Update configuration from Hytale's VoiceChatConfig
     * Called by the plugin during setup() after loading the config
     */
    public static void updateFromHytaleConfig(int port, boolean ssl, String certPath, String keyPath, String origins) {
        signalingPort = port;
        enableSSL = ssl;
        sslCertPath = certPath;
        sslKeyPath = keyPath;
        allowedOrigins = origins;
    }
    
    public static int getSignalingPort() {
        return signalingPort;
    }
    
    public static boolean isSSLEnabled() {
        return enableSSL;
    }
    
    public static String getSSLCertPath() {
        return sslCertPath;
    }
    
    public static String getSSLKeyPath() {
        return sslKeyPath;
    }
    
    public static String getAllowedOrigins() {
        return allowedOrigins;
    }

    /**
     * Checks if the given sample rate is supported by the voice chat system.
     * 
     * @param sampleRate the sample rate to check in Hz
     * @return true if the sample rate is in the SUPPORTED_SAMPLE_RATES array, false otherwise
     */
    public static boolean isSupportedSampleRate(int sampleRate) {
        for (int rate : SUPPORTED_SAMPLE_RATES) {
            if (rate == sampleRate) {
                return true;
            }
        }
        return false;
    }

    /**
     * Calculates the number of PCM samples in a single audio frame for the given sample rate.
     * Assumes a fixed frame duration of FRAME_DURATION_MS (20ms).
     * 
     * @param sampleRate the sample rate in Hz
     * @return the number of samples needed for a 20ms frame (e.g., 960 samples at 48000 Hz)
     */
    public static int frameSizeForSampleRate(int sampleRate) {
        return (sampleRate * FRAME_DURATION_MS) / 1000;
    }
}
