package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Packet sent by client to authenticate with username
 */
public class AuthenticationPacket extends VoicePacket {
    private final String username;
    
    public AuthenticationPacket(UUID clientId, String username) {
        super(clientId);
        this.username = username;
    }
    
    public String getUsername() {
        return username;
    }
    
    @Override
    public byte[] serialize() {
        byte[] usernameBytes = username.getBytes(StandardCharsets.UTF_8);
        ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 4 + usernameBytes.length);
        
        buffer.put((byte) 0x01); // Packet type: AUTH
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putInt(usernameBytes.length);
        buffer.put(usernameBytes);
        
        return buffer.array();
    }
    
    public static AuthenticationPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        byte packetType = buffer.get(); // Should be 0x01
        if (packetType != 0x01) {
            throw new IllegalArgumentException("Invalid packet type for AuthenticationPacket: " + packetType);
        }
        
        long mostSig = buffer.getLong();
        long leastSig = buffer.getLong();
        UUID clientId = new UUID(mostSig, leastSig);
        
        int usernameLength = buffer.getInt();
        byte[] usernameBytes = new byte[usernameLength];
        buffer.get(usernameBytes);
        String username = new String(usernameBytes, StandardCharsets.UTF_8);
        
        return new AuthenticationPacket(clientId, username);
    }
}
