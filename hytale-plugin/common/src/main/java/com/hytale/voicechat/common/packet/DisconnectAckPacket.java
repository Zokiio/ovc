package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.util.UUID;

/**
 * Packet sent by server to acknowledge client disconnection
 * Packet type: 0x08
 */
public class DisconnectAckPacket extends VoicePacket {
    private final String reason;
    
    public DisconnectAckPacket(UUID clientId, String reason) {
        super(clientId);
        this.reason = reason != null ? reason : "";
    }
    
    public String getReason() {
        return reason;
    }
    
    @Override
    public byte[] serialize() {
        byte[] reasonBytes = reason.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 4 + reasonBytes.length);
        
        buffer.put((byte) 0x08); // Packet type: DISCONNECT_ACK
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putInt(reasonBytes.length);
        buffer.put(reasonBytes);
        
        return buffer.array();
    }
    
    public static DisconnectAckPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        byte packetType = buffer.get(); // Should be 0x08
        if (packetType != 0x08) {
            throw new IllegalArgumentException("Invalid packet type for DisconnectAckPacket: " + packetType);
        }
        
        long mostSig = buffer.getLong();
        long leastSig = buffer.getLong();
        UUID clientId = new UUID(mostSig, leastSig);
        
        int reasonLength = buffer.getInt();
        byte[] reasonBytes = new byte[reasonLength];
        buffer.get(reasonBytes);
        String reason = new String(reasonBytes, java.nio.charset.StandardCharsets.UTF_8);
        
        return new DisconnectAckPacket(clientId, reason);
    }
}
