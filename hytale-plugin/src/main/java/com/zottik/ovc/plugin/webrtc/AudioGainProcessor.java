package com.zottik.ovc.plugin.webrtc;

import com.zottik.ovc.common.network.NetworkConfig;

final class AudioGainProcessor {
    private final double rolloffFactor;

    AudioGainProcessor(double rolloffFactor) {
        this.rolloffFactor = rolloffFactor;
    }

    double calculateVolumeMultiplier(double distance, double maxRange) {
        double scaledFadeStart = maxRange * NetworkConfig.PROXIMITY_FADE_START_RATIO;

        if (distance <= scaledFadeStart) {
            return 1.0;
        }

        if (distance >= maxRange) {
            return 0.0;
        }

        double fadeZone = maxRange - scaledFadeStart;
        double positionInFadeZone = distance - scaledFadeStart;
        double normalizedPosition = positionInFadeZone / fadeZone;
        double volumeMultiplier = 1.0 - Math.pow(normalizedPosition, rolloffFactor);
        return Math.max(0.0, Math.min(1.0, volumeMultiplier));
    }

    byte[] scalePcmVolume(byte[] audioData, double volumeMultiplier) {
        if (volumeMultiplier >= 1.0) {
            return audioData;
        }
        if (volumeMultiplier <= 0.0) {
            return new byte[audioData.length];
        }

        byte[] scaledData = new byte[audioData.length];
        for (int i = 0; i < audioData.length - 1; i += 2) {
            int sample = (audioData[i] & 0xFF) | (audioData[i + 1] << 8);
            sample = (int) (sample * volumeMultiplier);
            sample = Math.max(-32768, Math.min(32767, sample));
            scaledData[i] = (byte) (sample & 0xFF);
            scaledData[i + 1] = (byte) ((sample >> 8) & 0xFF);
        }

        return scaledData;
    }
}
