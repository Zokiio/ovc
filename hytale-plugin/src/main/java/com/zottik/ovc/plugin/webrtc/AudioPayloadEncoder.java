package com.zottik.ovc.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import com.zottik.ovc.common.network.NetworkConfig;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

final class AudioPayloadEncoder {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    private static final byte AUDIO_PAYLOAD_VERSION_BASIC = 1;
    private static final byte AUDIO_PAYLOAD_VERSION_WITH_PROXIMITY = 2;
    private static final byte AUDIO_PAYLOAD_VERSION_OPUS = 3;
    private static final int DATA_CHANNEL_MAX_PAYLOAD = 900;
    private static final int DATA_CHANNEL_HEADER_BASE_SIZE = 2;
    private static final int DATA_CHANNEL_OPUS_HEADER_BASE_SIZE = 3;
    private static final int PROXIMITY_METADATA_SIZE = 8;
    private static final int OPUS_GAIN_METADATA_SIZE = 4;
    private static final byte OPUS_FLAG_PROXIMITY = 0x01;
    private static final byte OPUS_FLAG_GAIN = 0x02;

    private final DataChannelAudioHandler dataChannelAudioHandler;

    AudioPayloadEncoder(DataChannelAudioHandler dataChannelAudioHandler) {
        this.dataChannelAudioHandler = dataChannelAudioHandler;
    }

    boolean sendAudio(
            UUID recipientId,
            String senderToken,
            byte[] audioData,
            AudioCodecType senderCodec,
            AudioCodecType recipientCodec,
            AudioProximityMetadata proximityMetadata,
            AudioGainMetadata gainMetadata
    ) {
        if (senderToken == null || senderToken.isEmpty() || audioData == null || audioData.length == 0) {
            return false;
        }
        if (dataChannelAudioHandler == null || !dataChannelAudioHandler.isClientOpen(recipientId)) {
            return false;
        }

        byte[] senderBytes = senderToken.getBytes(StandardCharsets.UTF_8);
        if (senderBytes.length > 255) {
            return false;
        }

        if (senderCodec == AudioCodecType.OPUS
                && recipientCodec == AudioCodecType.OPUS
                && NetworkConfig.isOpusDataChannelEnabled()) {
            return sendOpus(recipientId, senderBytes, audioData, proximityMetadata, gainMetadata);
        }

        return sendPcm(recipientId, senderBytes, audioData, proximityMetadata);
    }

    private boolean sendPcm(
            UUID recipientId,
            byte[] senderBytes,
            byte[] audioData,
            AudioProximityMetadata proximityMetadata
    ) {
        boolean includeProximityMetadata = proximityMetadata != null;
        int headerSize = DATA_CHANNEL_HEADER_BASE_SIZE + senderBytes.length;
        if (includeProximityMetadata) {
            headerSize += PROXIMITY_METADATA_SIZE;
        }
        int maxChunkSize = DATA_CHANNEL_MAX_PAYLOAD - headerSize;
        if (maxChunkSize <= 0) {
            return false;
        }
        if (audioData.length > maxChunkSize) {
            logger.atWarning().log(
                "Audio frame too large for DataChannel: %d bytes (max: %d) for client %s",
                audioData.length,
                maxChunkSize,
                recipientId
            );
            return false;
        }

        byte[] payload = new byte[headerSize + audioData.length];
        payload[0] = includeProximityMetadata ? AUDIO_PAYLOAD_VERSION_WITH_PROXIMITY : AUDIO_PAYLOAD_VERSION_BASIC;
        payload[1] = (byte) senderBytes.length;
        int offset = DATA_CHANNEL_HEADER_BASE_SIZE;
        System.arraycopy(senderBytes, 0, payload, offset, senderBytes.length);
        offset += senderBytes.length;
        if (includeProximityMetadata) {
            ByteBuffer.wrap(payload, offset, PROXIMITY_METADATA_SIZE)
                .putFloat((float) proximityMetadata.distance())
                .putFloat((float) proximityMetadata.maxRange());
            offset += PROXIMITY_METADATA_SIZE;
        }
        System.arraycopy(audioData, 0, payload, offset, audioData.length);

        return dataChannelAudioHandler.sendToClient(recipientId, payload);
    }

    private boolean sendOpus(
            UUID recipientId,
            byte[] senderBytes,
            byte[] audioData,
            AudioProximityMetadata proximityMetadata,
            AudioGainMetadata gainMetadata
    ) {
        boolean includeProximityMetadata = proximityMetadata != null;
        boolean includeGainMetadata = gainMetadata != null;

        int headerSize = DATA_CHANNEL_OPUS_HEADER_BASE_SIZE + senderBytes.length;
        if (includeProximityMetadata) {
            headerSize += PROXIMITY_METADATA_SIZE;
        }
        if (includeGainMetadata) {
            headerSize += OPUS_GAIN_METADATA_SIZE;
        }
        int maxChunkSize = DATA_CHANNEL_MAX_PAYLOAD - headerSize;
        if (maxChunkSize <= 0) {
            return false;
        }
        if (audioData.length > maxChunkSize) {
            logger.atWarning().log(
                "Opus frame too large for DataChannel: %d bytes (max: %d) for client %s",
                audioData.length,
                maxChunkSize,
                recipientId
            );
            return false;
        }

        byte[] payload = new byte[headerSize + audioData.length];
        payload[0] = AUDIO_PAYLOAD_VERSION_OPUS;
        payload[1] = (byte) senderBytes.length;

        byte flags = 0;
        if (includeProximityMetadata) {
            flags |= OPUS_FLAG_PROXIMITY;
        }
        if (includeGainMetadata) {
            flags |= OPUS_FLAG_GAIN;
        }
        payload[2] = flags;

        int offset = DATA_CHANNEL_OPUS_HEADER_BASE_SIZE;
        System.arraycopy(senderBytes, 0, payload, offset, senderBytes.length);
        offset += senderBytes.length;

        if (includeProximityMetadata) {
            ByteBuffer.wrap(payload, offset, PROXIMITY_METADATA_SIZE)
                .putFloat((float) proximityMetadata.distance())
                .putFloat((float) proximityMetadata.maxRange());
            offset += PROXIMITY_METADATA_SIZE;
        }
        if (includeGainMetadata) {
            ByteBuffer.wrap(payload, offset, OPUS_GAIN_METADATA_SIZE)
                .putFloat((float) gainMetadata.value());
            offset += OPUS_GAIN_METADATA_SIZE;
        }
        System.arraycopy(audioData, 0, payload, offset, audioData.length);

        return dataChannelAudioHandler.sendToClient(recipientId, payload);
    }
}
