package com.hytale.voicechat.common.network;

/**
 * Configuration for voice chat networking (WebRTC SFU)
 */
public class NetworkConfig {
    public static final int DEFAULT_SIGNALING_PORT = 24455; // WebSocket signaling for WebRTC
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
