package com.hytale.voicechat.common.network;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

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
    
    // Position tracking defaults
    public static final int DEFAULT_POSITION_SAMPLE_INTERVAL_MS = 50;     // 20 Hz
    public static final int DEFAULT_POSITION_BROADCAST_INTERVAL_MS = 50;  // 20 Hz
    public static final double DEFAULT_POSITION_MIN_DISTANCE_DELTA = 0.25;
    public static final double DEFAULT_POSITION_ROTATION_THRESHOLD_DEG = 2.0;

    // WebRTC transport mode is fixed to strict WebRTC-only.
    public static final String WEBRTC_TRANSPORT_MODE = "webrtc";
    public static final String DEFAULT_STUN_SERVERS = "stun:stun.cloudflare.com:3478,stun:stun.cloudflare.com:53";
    public static final String DEFAULT_TURN_SERVERS = "";
    public static final int DEFAULT_ICE_PORT_MIN = 0; // 0 = ephemeral
    public static final int DEFAULT_ICE_PORT_MAX = 0; // 0 = ephemeral
    public static final boolean DEFAULT_ENABLE_OPUS_DATA_CHANNEL = true;
    public static final int DEFAULT_OPUS_FRAME_DURATION_MS = 20;
    public static final int DEFAULT_OPUS_SAMPLE_RATE = 48000;
    public static final int DEFAULT_OPUS_CHANNELS = 1;
    public static final int DEFAULT_OPUS_TARGET_BITRATE = 24000;
    
    // Group management limits
    public static final int MAX_GROUP_NAME_LENGTH = 32;
    public static final int MAX_GROUP_MEMBER_COUNT = 200;
    public static final int MAX_GROUP_COUNT = 100;
    
    // Group behavior defaults
    public static final boolean DEFAULT_GROUP_IS_ISOLATED = true;
    public static final double DEFAULT_GROUP_MIN_VOLUME = 0.3;  // 30% minimum volume within proximity
    public static final boolean DEFAULT_USE_PROXIMITY_RADAR = false;
    
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
    
    // Position tracking settings - initialized from constants
    private static int positionSampleIntervalMs = DEFAULT_POSITION_SAMPLE_INTERVAL_MS;
    private static int positionBroadcastIntervalMs = DEFAULT_POSITION_BROADCAST_INTERVAL_MS;
    private static double positionMinDistanceDelta = DEFAULT_POSITION_MIN_DISTANCE_DELTA;
    private static double positionRotationThresholdDeg = DEFAULT_POSITION_ROTATION_THRESHOLD_DEG;
    
    // Volume processing mode: "server", "client", or "both"
    private static String volumeProcessingMode = "server";

    // WebRTC transport configuration
    private static String stunServers = DEFAULT_STUN_SERVERS;
    private static String turnServers = DEFAULT_TURN_SERVERS;
    private static int icePortMin = DEFAULT_ICE_PORT_MIN;
    private static int icePortMax = DEFAULT_ICE_PORT_MAX;
    private static boolean enableOpusDataChannel = DEFAULT_ENABLE_OPUS_DATA_CHANNEL;
    private static int opusFrameDurationMs = DEFAULT_OPUS_FRAME_DURATION_MS;
    private static int opusSampleRate = DEFAULT_OPUS_SAMPLE_RATE;
    private static int opusChannels = DEFAULT_OPUS_CHANNELS;
    private static int opusTargetBitrate = DEFAULT_OPUS_TARGET_BITRATE;
    private static List<String> stunServerList = Collections.emptyList();
    private static List<String> turnServerList = Collections.emptyList();
    
    // Group voice settings - initialized from constants
    private static boolean groupGlobalVoice = true;
    private static boolean groupSpatialAudio = true;
    private static double groupMinVolume = DEFAULT_GROUP_MIN_VOLUME;
    private static boolean useProximityRadar = DEFAULT_USE_PROXIMITY_RADAR;

    // Grace period before disconnecting web client after game quit
    private static int gameQuitGraceSeconds = 10;
    // Timeout for pending web client waiting for game session
    private static int pendingGameJoinTimeoutSeconds = 60;
    
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
            positionSampleIntervalMs = com.hytale.voicechat.common.config.VoiceConfig.getInt("PositionSampleIntervalMs", positionSampleIntervalMs);
            positionBroadcastIntervalMs = com.hytale.voicechat.common.config.VoiceConfig.getInt("PositionBroadcastIntervalMs", positionBroadcastIntervalMs);
            positionMinDistanceDelta = com.hytale.voicechat.common.config.VoiceConfig.getDouble("PositionMinDistanceDelta", positionMinDistanceDelta);
            positionRotationThresholdDeg = com.hytale.voicechat.common.config.VoiceConfig.getDouble("PositionRotationThresholdDeg", positionRotationThresholdDeg);
            volumeProcessingMode = com.hytale.voicechat.common.config.VoiceConfig.getString("VolumeProcessingMode", volumeProcessingMode);
            groupGlobalVoice = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("GroupGlobalVoice", groupGlobalVoice);
            groupSpatialAudio = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("GroupSpatialAudio", groupSpatialAudio);
            groupMinVolume = com.hytale.voicechat.common.config.VoiceConfig.getDouble("GroupMinVolume", groupMinVolume);
            useProximityRadar = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("USE_PROXIMITY_RADAR", useProximityRadar);
            gameQuitGraceSeconds = com.hytale.voicechat.common.config.VoiceConfig.getInt("GameQuitGraceSeconds", gameQuitGraceSeconds);
            pendingGameJoinTimeoutSeconds = com.hytale.voicechat.common.config.VoiceConfig.getInt("PendingGameJoinTimeoutSeconds", pendingGameJoinTimeoutSeconds);
            stunServers = com.hytale.voicechat.common.config.VoiceConfig.getString("StunServers", stunServers);
            turnServers = com.hytale.voicechat.common.config.VoiceConfig.getString("TurnServers", turnServers);
            icePortMin = com.hytale.voicechat.common.config.VoiceConfig.getInt("IcePortMin", icePortMin);
            icePortMax = com.hytale.voicechat.common.config.VoiceConfig.getInt("IcePortMax", icePortMax);
            enableOpusDataChannel = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("EnableOpusDataChannel", enableOpusDataChannel);
            opusFrameDurationMs = com.hytale.voicechat.common.config.VoiceConfig.getInt("OpusFrameDurationMs", opusFrameDurationMs);
            opusSampleRate = com.hytale.voicechat.common.config.VoiceConfig.getInt("OpusSampleRate", opusSampleRate);
            opusChannels = com.hytale.voicechat.common.config.VoiceConfig.getInt("OpusChannels", opusChannels);
            opusTargetBitrate = com.hytale.voicechat.common.config.VoiceConfig.getInt("OpusTargetBitrate", opusTargetBitrate);
            
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
            positionSampleIntervalMs = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.position.sample.interval.ms", positionSampleIntervalMs);
            positionBroadcastIntervalMs = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.position.broadcast.interval.ms", positionBroadcastIntervalMs);
            positionMinDistanceDelta = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.position.min.distance.delta", positionMinDistanceDelta);
            positionRotationThresholdDeg = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.position.rotation.threshold.deg", positionRotationThresholdDeg);
            volumeProcessingMode = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.volume.processing", volumeProcessingMode);
            groupGlobalVoice = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.group.global", groupGlobalVoice);
            groupSpatialAudio = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.group.spatial", groupSpatialAudio);
            groupMinVolume = com.hytale.voicechat.common.config.VoiceConfig.getDouble("voice.group.minvolume", groupMinVolume);
            useProximityRadar = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.ui.proximity.radar.enabled", useProximityRadar);
            gameQuitGraceSeconds = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.game.quit.grace.seconds", gameQuitGraceSeconds);
            pendingGameJoinTimeoutSeconds = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.game.join.pending.timeout.seconds", pendingGameJoinTimeoutSeconds);
            stunServers = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.webrtc.stun.servers", stunServers);
            turnServers = com.hytale.voicechat.common.config.VoiceConfig.getString("voice.webrtc.turn.servers", turnServers);
            icePortMin = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.webrtc.ice.port.min", icePortMin);
            icePortMax = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.webrtc.ice.port.max", icePortMax);
            enableOpusDataChannel = com.hytale.voicechat.common.config.VoiceConfig.getBoolean("voice.webrtc.opus.enabled", enableOpusDataChannel);
            opusFrameDurationMs = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.webrtc.opus.frame.duration.ms", opusFrameDurationMs);
            opusSampleRate = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.webrtc.opus.sample-rate", opusSampleRate);
            opusChannels = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.webrtc.opus.channels", opusChannels);
            opusTargetBitrate = com.hytale.voicechat.common.config.VoiceConfig.getInt("voice.webrtc.opus.target-bitrate", opusTargetBitrate);
        } catch (Exception e) {
            System.err.println("[NetworkConfig] Failed to load VoiceConfig: " + e.getMessage());
        }

        stunServerList = parseServerList(stunServers);
        turnServerList = parseServerList(turnServers);

        positionSampleIntervalMs = clampInt(positionSampleIntervalMs, 20, 500);
        positionBroadcastIntervalMs = clampInt(positionBroadcastIntervalMs, 20, 500);
        positionMinDistanceDelta = clampDouble(positionMinDistanceDelta, 0.05, 5.0);
        positionRotationThresholdDeg = clampDouble(positionRotationThresholdDeg, 0.1, 45.0);
        opusFrameDurationMs = clampInt(opusFrameDurationMs, 10, 60);
        opusSampleRate = isSupportedSampleRate(opusSampleRate) ? opusSampleRate : DEFAULT_OPUS_SAMPLE_RATE;
        opusChannels = clampInt(opusChannels, 1, 2);
        opusTargetBitrate = clampInt(opusTargetBitrate, 6000, 128000);
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
     * Get position sampling interval (ms).
     */
    public static int getPositionSampleIntervalMs() {
        return positionSampleIntervalMs;
    }

    /**
     * Get position broadcast interval (ms).
     */
    public static int getPositionBroadcastIntervalMs() {
        return positionBroadcastIntervalMs;
    }

    /**
     * Get minimum distance delta for position updates.
     */
    public static double getPositionMinDistanceDelta() {
        return positionMinDistanceDelta;
    }

    /**
     * Get rotation threshold (degrees) for position updates.
     */
    public static double getPositionRotationThresholdDeg() {
        return positionRotationThresholdDeg;
    }
    
    /**
     * Get the volume processing mode ("server", "client", or "both")
     */
    public static String getVolumeProcessingMode() {
        return volumeProcessingMode;
    }

    /**
     * Get WebRTC transport mode.
     * The server is strict WebRTC-only, so this always returns "webrtc".
     */
    public static String getWebRtcTransportMode() {
        return WEBRTC_TRANSPORT_MODE;
    }

    /**
     * Get configured STUN servers.
     */
    public static List<String> getStunServers() {
        return stunServerList;
    }

    /**
     * Get configured TURN servers (unused for now).
     */
    public static List<String> getTurnServers() {
        return turnServerList;
    }

    /**
     * Get minimum UDP port for ICE host candidates.
     * 0 means ephemeral ports.
     */
    public static int getIcePortMin() {
        return isValidIcePortRange(icePortMin, icePortMax) ? icePortMin : 0;
    }

    /**
     * Get maximum UDP port for ICE host candidates.
     * 0 means ephemeral ports.
     */
    public static int getIcePortMax() {
        return isValidIcePortRange(icePortMin, icePortMax) ? icePortMax : 0;
    }

    /**
     * Check if Opus-over-DataChannel mode is enabled.
     */
    public static boolean isOpusDataChannelEnabled() {
        return enableOpusDataChannel;
    }

    /**
     * Get Opus frame duration (milliseconds).
     */
    public static int getOpusFrameDurationMs() {
        return opusFrameDurationMs;
    }

    /**
     * Get Opus sample rate (Hz).
     */
    public static int getOpusSampleRate() {
        return opusSampleRate;
    }

    /**
     * Get Opus channel count.
     */
    public static int getOpusChannels() {
        return opusChannels;
    }

    /**
     * Get Opus target bitrate (bps).
     */
    public static int getOpusTargetBitrate() {
        return opusTargetBitrate;
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
     * Check if live proximity radar metadata should be sent to web clients.
     */
    public static boolean isProximityRadarEnabled() {
        return useProximityRadar;
    }

    /**
     * Grace period before disconnecting web client after game quit (seconds).
     */
    public static int getGameQuitGraceSeconds() {
        return gameQuitGraceSeconds;
    }

    /**
     * Timeout for pending web clients waiting for game session (seconds).
     */
    public static int getPendingGameJoinTimeoutSeconds() {
        return pendingGameJoinTimeoutSeconds;
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

    private static boolean isValidIcePortRange(int min, int max) {
        if (min <= 0 || max <= 0) {
            return false;
        }
        return max >= min;
    }

    private static int clampInt(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double clampDouble(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private static List<String> parseServerList(String raw) {
        if (raw == null) {
            return List.of();
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return List.of();
        }
        if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            trimmed = trimmed.substring(1, trimmed.length() - 1);
        }

        String[] parts = trimmed.split(",");
        List<String> servers = new ArrayList<>();
        for (String part : parts) {
            String server = part.trim();
            if (server.isEmpty()) {
                continue;
            }
            if (server.startsWith("\"") && server.endsWith("\"") && server.length() >= 2) {
                server = server.substring(1, server.length() - 1);
            }
            if (!server.isEmpty()) {
                servers.add(server);
            }
        }

        return servers.isEmpty() ? List.of() : Collections.unmodifiableList(servers);
    }
}
