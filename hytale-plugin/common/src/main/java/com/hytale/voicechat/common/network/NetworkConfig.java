package com.hytale.voicechat.common.network;

/**
 * Configuration for voice chat networking
 */
public class NetworkConfig {
    public static final int DEFAULT_VOICE_PORT = 24454;
    public static final int DEFAULT_API_PORT = 24455;
    public static final int SAMPLE_RATE = 48000;
    public static final int FRAME_SIZE = 960; // 20ms at 48kHz
    public static final int MAX_PACKET_SIZE = 1024;
    public static final double DEFAULT_PROXIMITY_DISTANCE = 30.0;
    public static final double MAX_VOICE_DISTANCE = 100.0;

    private NetworkConfig() {
        // Utility class
    }
}
