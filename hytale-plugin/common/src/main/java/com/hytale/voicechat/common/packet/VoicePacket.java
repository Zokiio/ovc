package com.hytale.voicechat.common.packet;

import java.util.UUID;

/**
 * Base class for all voice chat packets
 */
public abstract class VoicePacket {
    private final UUID senderId;
    private final long timestamp;

    protected VoicePacket(UUID senderId) {
        this.senderId = senderId;
        this.timestamp = System.currentTimeMillis();
    }

    public UUID getSenderId() {
        return senderId;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public abstract byte[] serialize();
}
