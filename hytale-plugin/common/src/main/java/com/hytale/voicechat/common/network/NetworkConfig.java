package com.hytale.voicechat.common.network;

/**
 * Configuration for voice chat networking (WebRTC SFU)
 * Values can be set via Hytale config system or legacy VoiceConfig fallback
 */
public class NetworkConfig {
    // ============================================================================
    // CONSTANTS - Default/fallback values and limits (defined first)
    // These are public static final and cannot be changed at runtime
    // ============================================================================
    
    // Audio processing constants
    public static final int DEFAULT_SAMPLE_RATE = 48000;
    public static final int FRAME_DURATION_MS = 20;
    public static final int FRAME_SIZE = 960; // 20ms at 48kHz
    public static final int[] SUPPORTED_SAMPLE_RATES = {8000, 12000, 16000, 24000, 48000};
    public static final int MAX_PACKET_SIZE = 1024;
    
    // Voice chat proximity defaults
    public static final double DEFAULT_PROXIMITY_DISTANCE = 50.0;
    public static final double PROXIMITY_FADE_START = 20.0;        // 70% of default proximity
    public static final double PROXIMITY_ROLLOFF_FACTOR = 1.5;
    public static final double PROXIMITY_FADE_START_RATIO = 0.7;   // Fade starts at 70% of max range
    public static final double MAX_VOICE_DISTANCE = 100.0;
    
    // Group management limits
    public static final int MAX_GROUP_NAME_LENGTH = 32;
    public static final int MAX_GROUP_MEMBER_COUNT = 200;
    public static final int MAX_GROUP_COUNT = 100;
    
    // Group behavior defaults
    public static final boolean DEFAULT_GROUP_IS_ISOLATED = true;
    public static final double DEFAULT_GROUP_MIN_VOLUME = 0.3;  // 30% minimum volume within proximity
    
    // ============================================================================
    // CONFIGURABLE RUNTIME VALUES (initialized from constants above)
    // These can be overridden by config files
    // ============================================================================
    
    // Signaling server configuration
    private static int signalingPort = 24455;
    
    // SSL/TLS configuration
    private static boolean enableSSL = false;
    private static String sslCertPath = "/etc/letsencrypt/live/example.com/fullchain.pem";
    private static String sslKeyPath = "/etc/letsencrypt/live/example.com/privkey.pem";
    
    // CORS allowed origins
    private static String allowedOrigins = "https://example.com,https://voice.example.com,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173";
    
    // Voice chat proximity settings - initialized from constants
    private static double defaultProximityDistance = DEFAULT_PROXIMITY_DISTANCE;
    private static double proximityFadeStart = PROXIMITY_FADE_START;
    private static double proximityRolloffFactor = PROXIMITY_ROLLOFF_FACTOR;
    private static double maxVoiceDistance = MAX_VOICE_DISTANCE;
    
    // Volume processing mode: "server", "client", or "both"
    private static String volumeProcessingMode = "server";
    
    // Group voice settings - initialized from constants
    private static boolean groupGlobalVoice = true;
    private static boolean groupSpatialAudio = true;
    private static double groupMinVolume = DEFAULT_GROUP_MIN_VOLUME;
    
    // Legacy fallback to custom VoiceConfig for backward compatibility
    static {
        try {
            // Try HOCON-style property names first (from ovc.conf)
            signalingPort = com.hytale.voicechat.common.config.VoiceConfig.getInt("SignalingPort", signalingPort);
            enableSSL = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("EnableSSL", enableSSL);
            sslCertPath = com.hytale.voicechat.common.config.VoiceConfig.getString("SSLCertPath", sslCertPath);
            sslKeyPath = com.hytale.voicechat.common.config.VoiceConfig.getString("SSLKeyPath", sslKeyPath);
            allowedOrigins = com.hytale.voicechat.common.config.VoiceConfig.getString("AllowedOrigins", allowedOrigins);
            defaultProximityDistance = com.hytale.voicechat.common.config.VoiceConfig.getDouble("DefaultProximityRange", defaultProximityDistance);
            proximityFadeStart = com.hytale.voicechat.common.config.VoiceConfig.getDouble("ProximityFadeStart", proximityFadeStart);
            proximityRolloffFactor = com.hytale.voicechat.common.config.VoiceConfig.getDouble("ProximityRolloffFactor", proximityRolloffFactor);
            maxVoiceDistance = com.hytale.voicechat.common.config.VoiceConfig.getDouble("MaxVoiceDistance", maxVoiceDistance);
            volumeProcessingMode = com.hytale.voicechat.common.config.VoiceConfig.getString("VolumeProcessingMode", volumeProcessingMode);
            groupGlobalVoice = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("GroupGlobalVoice", groupGlobalVoice);
            groupSpatialAudio = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("GroupSpatialAudio", groupSpatialAudio);
            groupMinVolume = com.hytale.voicechat.common.config.VoiceConfig.getDouble("GroupMinVolume", groupMinVolume);
            
            // Fallback to old property names for backward compatibility
            signalingPort = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.signaling.port", signalingPort);
            enableSSL = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.ssl.enabled", enableSSL);
            sslCertPath = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.ssl.cert", sslCertPath);
            sslKeyPath = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.ssl.key", sslKeyPath);
            allowedOrigins = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.allowed.origins", allowedOrigins);
            defaultProximityDistance = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.proximity.default", defaultProximityDistance);
            proximityFadeStart = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.proximity.fade.start", proximityFadeStart);
            proximityRolloffFactor = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.proximity.rolloff", proximityRolloffFactor);
            maxVoiceDistance = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.proximity.max", maxVoiceDistance);
            volumeProcessingMode = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.volume.processing", volumeProcessingMode);
            groupGlobalVoice = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.group.global", groupGlobalVoice);
            groupSpatialAudio = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.group.spatial", groupSpatialAudio);
            groupMinVolume = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.group.minvolume", groupMinVolume);
        } catch (Exception e) {
            System.err.println("[NetworkConfig] Failed to load VoiceConfig: " + e.getMessage());
        }
    }

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
     * Get the configurable default proximity distance (from config file)
     * This is used for players not in a group
     */
    public static double getDefaultProximityDistance() {
        return defaultProximityDistance;
    }
    
    /**
     * Get the distance where volume fade begins
     */
    public static double getProximityFadeStart() {
        return proximityFadeStart;
    }
    
    /**
     * Get the volume rolloff factor (1.0=linear, 2.0=quadratic)
     */
    public static double getProximityRolloffFactor() {
        return proximityRolloffFactor;
    }
    
    /**
     * Get the absolute maximum voice transmission distance
     */
    public static double getMaxVoiceDistance() {
        return maxVoiceDistance;
    }
    
    /**
     * Get the volume processing mode ("server", "client", or "both")
     */
    public static String getVolumeProcessingMode() {
        return volumeProcessingMode;
    }
    
    /**
     * Check if server should process volume adjustment
     */
    public static boolean isServerSideVolumeEnabled() {
        return "server".equalsIgnoreCase(volumeProcessingMode) || "both".equalsIgnoreCase(volumeProcessingMode);
    }
    
    /**
     * Check if client should process volume adjustment
     */
    public static boolean isClientSideVolumeEnabled() {
        return "client".equalsIgnoreCase(volumeProcessingMode) || "both".equalsIgnoreCase(volumeProcessingMode);
    }
    
    /**
     * Check if group voice is global (no distance limit for groups)
     */
    public static boolean isGroupGlobalVoice() {
        return groupGlobalVoice;
    }
    
    /**
     * Check if spatial audio is applied to group voice
     */
    public static boolean isGroupSpatialAudio() {
        return groupSpatialAudio;
    }
    
    /**
     * Get the minimum volume for global group voice
     */
    public static double getGroupMinVolume() {
        return groupMinVolume;
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
