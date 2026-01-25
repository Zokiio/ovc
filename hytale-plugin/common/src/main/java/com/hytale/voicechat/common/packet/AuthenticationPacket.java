package com.hytale.voicechat.common.packet;

import com.hytale.voicechat.common.network.NetworkConfig;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Packet sent by client to authenticate with username.
 * 
 * <p>Protocol Compatibility Notes:</p>
 * <ul>
 *   <li>The requestedSampleRate field (4 bytes) is an optional extension added to support
 *       sample rate negotiation between client and server.</li>
 *   <li>Backward compatibility: Older servers that don't expect the sample rate field can
 *       still parse packets from newer clients by checking buffer.remaining() before reading
 *       the optional field (see deserialize method).</li>
 *   <li>Forward compatibility: Newer servers always write the sample rate field, but older
 *       clients won't parse it. If clients and servers need to be upgraded independently,
 *       consider adding a protocol version field to the packet header.</li>
 *   <li>Current implementation assumes server and client are updated together for sample
 *       rate negotiation to work properly.</li>
 * </ul>
 */
public class AuthenticationPacket extends VoicePacket {
    private final String username;
    private final int requestedSampleRate;
    
    public AuthenticationPacket(UUID clientId, String username) {
        this(clientId, username, NetworkConfig.DEFAULT_SAMPLE_RATE);
    }

    public AuthenticationPacket(UUID clientId, String username, int requestedSampleRate) {
        super(clientId);
        this.username = username;
        this.requestedSampleRate = requestedSampleRate;
    }
    
    public String getUsername() {
        return username;
    }

    public int getRequestedSampleRate() {
        return requestedSampleRate;
    }
    
    @Override
    public byte[] serialize() {
        byte[] usernameBytes = username.getBytes(StandardCharsets.UTF_8);
        ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 4 + usernameBytes.length + 4);
        
        buffer.put((byte) 0x01); // Packet type: AUTH
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putInt(usernameBytes.length);
        buffer.put(usernameBytes);
        buffer.putInt(requestedSampleRate);
        
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

        int requestedSampleRate = NetworkConfig.DEFAULT_SAMPLE_RATE;
        if (buffer.remaining() >= 4) {
            requestedSampleRate = buffer.getInt();
        }
        
        return new AuthenticationPacket(clientId, username, requestedSampleRate);
    }
}
