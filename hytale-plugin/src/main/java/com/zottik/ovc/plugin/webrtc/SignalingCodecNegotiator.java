package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.zottik.ovc.common.network.NetworkConfig;

final class SignalingCodecNegotiator {
    private SignalingCodecNegotiator() {
    }

    static JsonArray buildSupportedAudioCodecs() {
        return buildSupportedAudioCodecs(NetworkConfig.isOpusDataChannelEnabled());
    }

    static JsonArray buildSupportedAudioCodecs(boolean opusEnabled) {
        JsonArray codecs = new JsonArray();
        if (opusEnabled) {
            codecs.add(WebRTCClient.AUDIO_CODEC_OPUS);
        } else {
            codecs.add(WebRTCClient.AUDIO_CODEC_PCM);
        }
        return codecs;
    }

    static JsonObject buildAudioCodecConfig() {
        return buildAudioCodecConfig(
            NetworkConfig.getOpusSampleRate(),
            NetworkConfig.getOpusChannels(),
            NetworkConfig.getOpusFrameDurationMs(),
            NetworkConfig.getOpusTargetBitrate()
        );
    }

    static JsonObject buildAudioCodecConfig(int sampleRate, int channels, int frameDurationMs, int targetBitrate) {
        JsonObject config = new JsonObject();
        config.addProperty("sampleRate", sampleRate);
        config.addProperty("channels", channels);
        config.addProperty("frameDurationMs", frameDurationMs);
        config.addProperty("targetBitrate", targetBitrate);
        return config;
    }

    static boolean clientSupportsCodec(JsonObject data, String codec) {
        if (data == null || codec == null || codec.isEmpty()) {
            return false;
        }

        String normalizedCodec = codec.trim().toLowerCase();
        if (normalizedCodec.isEmpty()) {
            return false;
        }

        String preferredCodec = "";
        if (data.has("preferredAudioCodec") && data.get("preferredAudioCodec").isJsonPrimitive()) {
            preferredCodec = data.get("preferredAudioCodec").getAsString();
        }
        if (normalizedCodec.equals(preferredCodec == null ? "" : preferredCodec.trim().toLowerCase())) {
            return true;
        }

        if (!data.has("audioCodecs") || !data.get("audioCodecs").isJsonArray()) {
            return false;
        }

        for (JsonElement codecElement : data.getAsJsonArray("audioCodecs")) {
            if (codecElement == null || !codecElement.isJsonPrimitive()) {
                continue;
            }
            String candidate = codecElement.getAsString();
            if (candidate != null && normalizedCodec.equals(candidate.trim().toLowerCase())) {
                return true;
            }
        }
        return false;
    }

    static String negotiateAudioCodec(JsonObject data) {
        return negotiateAudioCodec(data, NetworkConfig.isOpusDataChannelEnabled());
    }

    static String negotiateAudioCodec(JsonObject data, boolean opusEnabled) {
        if (!opusEnabled) {
            return WebRTCClient.AUDIO_CODEC_PCM;
        }

        if (!clientSupportsCodec(data, WebRTCClient.AUDIO_CODEC_OPUS)) {
            return null;
        }

        return WebRTCClient.AUDIO_CODEC_OPUS;
    }
}
