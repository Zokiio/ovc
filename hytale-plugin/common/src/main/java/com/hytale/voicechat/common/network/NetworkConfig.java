package com.hytale.voicechat.common.network;

/**
 * Configuration for voice chat networking
 */
public class NetworkConfig {
    public static final int DEFAULT_VOICE_PORT = 24454;
    public static final int DEFAULT_API_PORT = 24455;
    public static final int DEFAULT_SAMPLE_RATE = 48000;
    public static final int SAMPLE_RATE = DEFAULT_SAMPLE_RATE;
    public static final int FRAME_DURATION_MS = 20;
    public static final int FRAME_SIZE = 960; // 20ms at 48kHz
    public static final int[] SUPPORTED_SAMPLE_RATES = {8000, 12000, 16000, 24000, 48000};
    public static final int MAX_PACKET_SIZE = 1024;
    public static final double DEFAULT_PROXIMITY_DISTANCE = 30.0;
    public static final double MAX_VOICE_DISTANCE = 100.0;
    
    // Packet validation limits (realistic values for Hytale servers)
    // Note: MAX_GROUP_NAME_LENGTH aligns with GroupManager's validation (32 chars)
    public static final int MAX_GROUP_NAME_LENGTH = 32;
    public static final int MAX_GROUP_MEMBER_COUNT = 200;
    public static final int MAX_GROUP_COUNT = 100;

    private NetworkConfig() {
        // Utility class
    }

    public static boolean isSupportedSampleRate(int sampleRate) {
        for (int rate : SUPPORTED_SAMPLE_RATES) {
            if (rate == sampleRate) {
                return true;
            }
        }
        return false;
    }

    public static int frameSizeForSampleRate(int sampleRate) {
        return (sampleRate * FRAME_DURATION_MS) / 1000;
    }
}
