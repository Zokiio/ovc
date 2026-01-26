package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Packet sent by server to map player hash IDs to usernames.
 * Allows clients to display human-readable names instead of hash IDs.
 * 
 * Packet type: 0x0B
 * Format: [type(1)] [serverId(16)] [hashId(4)] [usernameLen(4)] [username]
 */
public class PlayerNamePacket extends VoicePacket {
    private final int hashId;
    private final String username;

    public PlayerNamePacket(UUID serverId, int hashId, String username) {
        super(serverId);
        this.hashId = hashId;
        this.username = username;
    }

    public int getHashId() {
        return hashId;
    }

    public String getUsername() {
        return username;
    }

    @Override
    public byte[] serialize() {
        byte[] usernameBytes = username.getBytes(StandardCharsets.UTF_8);
        ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 4 + 4 + usernameBytes.length);
        
        buffer.put((byte) 0x0B); // Packet type: PLAYER_NAME
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putInt(hashId);
        buffer.putInt(usernameBytes.length);
        buffer.put(usernameBytes);
        
        return buffer.array();
    }

    public static PlayerNamePacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        byte packetType = buffer.get(); // Should be 0x0B
        if (packetType != 0x0B) {
            throw new IllegalArgumentException("Invalid packet type for PlayerNamePacket: " + packetType);
        }
        
        long mostSig = buffer.getLong();
        long leastSig = buffer.getLong();
        UUID serverId = new UUID(mostSig, leastSig);
        
        int hashId = buffer.getInt();
        
        int usernameLength = buffer.getInt();
        if (usernameLength < 0 || usernameLength > 256) {
            throw new IllegalArgumentException("Invalid username length: " + usernameLength);
        }
        if (buffer.remaining() < usernameLength) {
            throw new IllegalArgumentException("Insufficient data for username: expected " + usernameLength
                    + " bytes, but only " + buffer.remaining() + " available");
        }
        byte[] usernameBytes = new byte[usernameLength];
        buffer.get(usernameBytes);
        String username = new String(usernameBytes, StandardCharsets.UTF_8);
        
        return new PlayerNamePacket(serverId, hashId, username);
    }
}
