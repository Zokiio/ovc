package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SignalingCodecNegotiatorTest {
    @Test
    void buildSupportedAudioCodecsUsesOpusWhenEnabled() {
        JsonArray codecs = SignalingCodecNegotiator.buildSupportedAudioCodecs(true);
        assertEquals(1, codecs.size());
        assertEquals(WebRTCClient.AUDIO_CODEC_OPUS, codecs.get(0).getAsString());
    }

    @Test
    void buildSupportedAudioCodecsUsesPcmWhenDisabled() {
        JsonArray codecs = SignalingCodecNegotiator.buildSupportedAudioCodecs(false);
        assertEquals(1, codecs.size());
        assertEquals(WebRTCClient.AUDIO_CODEC_PCM, codecs.get(0).getAsString());
    }

    @Test
    void clientSupportsCodecChecksPreferredCodecCaseInsensitive() {
        JsonObject data = new JsonObject();
        data.addProperty("preferredAudioCodec", "OpUs");

        assertTrue(SignalingCodecNegotiator.clientSupportsCodec(data, WebRTCClient.AUDIO_CODEC_OPUS));
        assertFalse(SignalingCodecNegotiator.clientSupportsCodec(data, WebRTCClient.AUDIO_CODEC_PCM));
    }

    @Test
    void clientSupportsCodecChecksAudioCodecArray() {
        JsonObject data = new JsonObject();
        JsonArray codecs = new JsonArray();
        codecs.add("pcm");
        codecs.add("opus");
        data.add("audioCodecs", codecs);

        assertTrue(SignalingCodecNegotiator.clientSupportsCodec(data, WebRTCClient.AUDIO_CODEC_OPUS));
        assertTrue(SignalingCodecNegotiator.clientSupportsCodec(data, WebRTCClient.AUDIO_CODEC_PCM));
    }

    @Test
    void negotiateAudioCodecReturnsExpectedValues() {
        JsonObject supportsOpus = new JsonObject();
        JsonArray codecs = new JsonArray();
        codecs.add("opus");
        supportsOpus.add("audioCodecs", codecs);

        JsonObject noCodecSupport = new JsonObject();

        assertEquals(WebRTCClient.AUDIO_CODEC_OPUS, SignalingCodecNegotiator.negotiateAudioCodec(supportsOpus, true));
        assertNull(SignalingCodecNegotiator.negotiateAudioCodec(noCodecSupport, true));
        assertEquals(WebRTCClient.AUDIO_CODEC_PCM, SignalingCodecNegotiator.negotiateAudioCodec(noCodecSupport, false));
    }
}
