package com.zottik.ovc.plugin.webrtc;

import com.zottik.ovc.common.network.NetworkConfig;
import org.junit.jupiter.api.Test;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AudioPayloadEncoderTest {
    @Test
    void sendAudioEncodesPcmWithProximityMetadata() {
        UUID recipientId = UUID.randomUUID();
        AtomicReference<byte[]> payloadRef = new AtomicReference<>();

        DataChannelAudioHandler handler = new DataChannelAudioHandler(null);
        handler.registerClient(recipientId, new DataChannelAudioHandler.DataChannelSender() {
            @Override
            public boolean isOpen() {
                return true;
            }

            @Override
            public DataChannelAudioHandler.SendResult send(byte[] audioData) {
                payloadRef.set(audioData);
                return DataChannelAudioHandler.SendResult.SUCCESS;
            }
        });

        AudioPayloadEncoder encoder = new AudioPayloadEncoder(handler);
        boolean sent = encoder.sendAudio(
            recipientId,
            "sender-1",
            new byte[] {1, 2, 3, 4},
            AudioCodecType.PCM,
            AudioCodecType.PCM,
            new AudioProximityMetadata(5.0, 50.0),
            null
        );

        assertTrue(sent);
        byte[] payload = payloadRef.get();
        assertNotNull(payload);
        assertEquals(2, payload[0]); // AUDIO_PAYLOAD_VERSION_WITH_PROXIMITY
    }

    @Test
    void sendAudioEncodesOpusFlagsWhenEnabled() {
        UUID recipientId = UUID.randomUUID();
        AtomicReference<byte[]> payloadRef = new AtomicReference<>();

        DataChannelAudioHandler handler = new DataChannelAudioHandler(null);
        handler.registerClient(recipientId, new DataChannelAudioHandler.DataChannelSender() {
            @Override
            public boolean isOpen() {
                return true;
            }

            @Override
            public DataChannelAudioHandler.SendResult send(byte[] audioData) {
                payloadRef.set(audioData);
                return DataChannelAudioHandler.SendResult.SUCCESS;
            }
        });

        AudioPayloadEncoder encoder = new AudioPayloadEncoder(handler);
        boolean sent = encoder.sendAudio(
            recipientId,
            "sender-1",
            new byte[] {1, 2, 3, 4},
            AudioCodecType.OPUS,
            AudioCodecType.OPUS,
            new AudioProximityMetadata(5.0, 50.0),
            new AudioGainMetadata(0.75)
        );

        assertTrue(sent);
        byte[] payload = payloadRef.get();
        assertNotNull(payload);
        if (NetworkConfig.isOpusDataChannelEnabled()) {
            assertEquals(3, payload[0]); // AUDIO_PAYLOAD_VERSION_OPUS
            assertEquals(0x03, payload[2]); // OPUS_FLAG_PROXIMITY | OPUS_FLAG_GAIN
        } else {
            assertEquals(2, payload[0]); // Falls back to PCM with proximity metadata
        }
    }

    @Test
    void sendAudioRejectsOversizedFrames() {
        UUID recipientId = UUID.randomUUID();

        DataChannelAudioHandler handler = new DataChannelAudioHandler(null);
        handler.registerClient(recipientId, new DataChannelAudioHandler.DataChannelSender() {
            @Override
            public boolean isOpen() {
                return true;
            }

            @Override
            public DataChannelAudioHandler.SendResult send(byte[] audioData) {
                return DataChannelAudioHandler.SendResult.SUCCESS;
            }
        });

        AudioPayloadEncoder encoder = new AudioPayloadEncoder(handler);
        boolean sent = encoder.sendAudio(
            recipientId,
            "sender-1",
            new byte[4000],
            AudioCodecType.PCM,
            AudioCodecType.PCM,
            null,
            null
        );

        assertFalse(sent);
    }
}
