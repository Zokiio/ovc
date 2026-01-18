package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.util.UUID;

/**
 * Packet containing encoded audio data
 */
public class AudioPacket extends VoicePacket {
    private final byte[] audioData;
    private final int sequenceNumber;
    private final byte codec;
    private final Float posX;
    private final Float posY;
    private final Float posZ;

    public AudioPacket(UUID senderId, byte codec, byte[] audioData, int sequenceNumber) {
        this(senderId, codec, audioData, sequenceNumber, null, null, null);
    }

    public AudioPacket(UUID senderId, byte codec, byte[] audioData, int sequenceNumber, Float posX, Float posY, Float posZ) {
        super(senderId);
        this.audioData = audioData;
        this.sequenceNumber = sequenceNumber;
        this.codec = codec;
        this.posX = posX;
        this.posY = posY;
        this.posZ = posZ;
    }

    public AudioPacket(UUID senderId, byte[] audioData, int sequenceNumber) {
        this(senderId, AudioCodec.PCM, audioData, sequenceNumber);
    }

    public byte[] getAudioData() {
        return audioData;
    }

    public int getSequenceNumber() {
        return sequenceNumber;
    }

    public byte getCodec() {
        return codec;
    }

    public boolean hasPosition() {
        return posX != null && posY != null && posZ != null;
    }

    public Float getPosX() {
        return posX;
    }

    public Float getPosY() {
        return posY;
    }

    public Float getPosZ() {
        return posZ;
    }

    @Override
    public byte[] serialize() {
        int extra = hasPosition() ? 12 : 0;
        ByteBuffer buffer = ByteBuffer.allocate(1 + 1 + 16 + 4 + 4 + audioData.length + extra);
        byte codecByte = codec;
        if (hasPosition()) {
            codecByte |= (byte) 0x80; // flag indicates trailing position
        }

        buffer.put((byte) 0x02); // Packet type: AUDIO
        buffer.put(codecByte);
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putInt(sequenceNumber);
        buffer.putInt(audioData.length);
        buffer.put(audioData);

        if (hasPosition()) {
            buffer.putFloat(posX);
            buffer.putFloat(posY);
            buffer.putFloat(posZ);
        }
        return buffer.array();
    }

    public static AudioPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        byte packetType = buffer.get(); // Should be 0x02
        if (packetType != 0x02) {
            throw new IllegalArgumentException("Invalid packet type for AudioPacket: " + packetType);
        }
        byte potentialCodec = buffer.get();
        byte baseCodec = AudioCodec.baseCodec(potentialCodec);
        byte codec = AudioCodec.isSupported(potentialCodec) ? baseCodec : AudioCodec.PCM;

        if (!AudioCodec.isSupported(potentialCodec)) {
            buffer.position(1); // rewind to treat as legacy packet
        }

        long mostSig = buffer.getLong();
        long leastSig = buffer.getLong();
        UUID senderId = new UUID(mostSig, leastSig);
        int sequenceNumber = buffer.getInt();
        int audioLength = buffer.getInt();
        byte[] audioData = new byte[audioLength];
        buffer.get(audioData);

        Float posX = null;
        Float posY = null;
        Float posZ = null;
        if ((potentialCodec & (byte) 0x80) != 0 && buffer.remaining() >= 12) {
            posX = buffer.getFloat();
            posY = buffer.getFloat();
            posZ = buffer.getFloat();
        }

        return new AudioPacket(senderId, codec, audioData, sequenceNumber, posX, posY, posZ);
    }
}
