package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Server acknowledgment of client authentication
 */
public class AuthAckPacket {
    private static final byte PACKET_TYPE = 0x03;
    private UUID clientId;
    private boolean accepted;
    private String message;

    public AuthAckPacket() {
    }

    public AuthAckPacket(UUID clientId, boolean accepted, String message) {
        this.clientId = clientId;
        this.accepted = accepted;
        this.message = message;
    }

    public byte[] serialize() {
        ByteBuffer buffer = ByteBuffer.allocate(1024);
        
        // Packet type
        buffer.put(PACKET_TYPE);
        
        // Client ID (UUID)
        buffer.putLong(clientId.getMostSignificantBits());
        buffer.putLong(clientId.getLeastSignificantBits());
        
        // Accepted flag
        buffer.put((byte) (accepted ? 1 : 0));
        
        // Message (UTF-8 string with length prefix)
        byte[] messageBytes = message != null ? message.getBytes(StandardCharsets.UTF_8) : new byte[0];
        buffer.putShort((short) messageBytes.length);
        buffer.put(messageBytes);
        
        // Return trimmed array
        byte[] data = new byte[buffer.position()];
        System.arraycopy(buffer.array(), 0, data, 0, buffer.position());
        return data;
    }

    public static AuthAckPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        // Skip packet type byte
        buffer.get();
        
        // Client ID
        long msb = buffer.getLong();
        long lsb = buffer.getLong();
        UUID clientId = new UUID(msb, lsb);
        
        // Accepted flag
        boolean accepted = buffer.get() == 1;
        
        // Message
        short messageLength = buffer.getShort();
        byte[] messageBytes = new byte[messageLength];
        buffer.get(messageBytes);
        String message = new String(messageBytes, StandardCharsets.UTF_8);
        
        AuthAckPacket packet = new AuthAckPacket();
        packet.clientId = clientId;
        packet.accepted = accepted;
        packet.message = message;
        return packet;
    }

    public UUID getClientId() {
        return clientId;
    }

    public boolean isAccepted() {
        return accepted;
    }

    public String getMessage() {
        return message;
    }
}
