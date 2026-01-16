package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.util.UUID;

/**
 * Packet containing encoded audio data
 */
public class AudioPacket extends VoicePacket {
    private final byte[] audioData;
    private final int sequenceNumber;

    public AudioPacket(UUID senderId, byte[] audioData, int sequenceNumber) {
        super(senderId);
        this.audioData = audioData;
        this.sequenceNumber = sequenceNumber;
    }

    public byte[] getAudioData() {
        return audioData;
    }

    public int getSequenceNumber() {
        return sequenceNumber;
    }

    @Override
    public byte[] serialize() {
        ByteBuffer buffer = ByteBuffer.allocate(20 + 4 + 4 + audioData.length);
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putInt(sequenceNumber);
        buffer.putInt(audioData.length);
        buffer.put(audioData);
        return buffer.array();
    }

    public static AudioPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        long mostSig = buffer.getLong();
        long leastSig = buffer.getLong();
        UUID senderId = new UUID(mostSig, leastSig);
        int sequenceNumber = buffer.getInt();
        int audioLength = buffer.getInt();
        byte[] audioData = new byte[audioLength];
        buffer.get(audioData);
        return new AudioPacket(senderId, audioData, sequenceNumber);
    }
}
