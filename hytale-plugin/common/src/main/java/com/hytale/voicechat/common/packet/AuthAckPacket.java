package com.hytale.voicechat.common.packet;

import com.hytale.voicechat.common.network.NetworkConfig;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Server acknowledgment of client authentication.
 * 
 * <p>Rejection reason codes:</p>
 * <ul>
 *   <li>0 = ACCEPTED</li>
 *   <li>1 = PLAYER_NOT_FOUND (player UUID not in-game yet)</li>
 *   <li>2 = SERVER_NOT_READY (server initializing)</li>
 *   <li>3 = INVALID_CREDENTIALS</li>
 * </ul>
 * 
 * <p>Protocol Compatibility Notes:</p>
 * <ul>
 *   <li>The selectedSampleRate field (4 bytes) is always included in serialization but
 *       optional during deserialization for backward compatibility.</li>
 *   <li>Older clients won't expect or parse this field, which may cause issues if server
 *       and client versions are mismatched.</li>
 *   <li>For production use, consider adding a protocol version field or ensuring
 *       coordinated deployment of client and server updates.</li>
 * </ul>
 */
public class AuthAckPacket {
    private static final byte PACKET_TYPE = 0x03;
    
    public static final byte REASON_ACCEPTED = 0;
    public static final byte REASON_PLAYER_NOT_FOUND = 1;
    public static final byte REASON_SERVER_NOT_READY = 2;
    public static final byte REASON_INVALID_CREDENTIALS = 3;
    
    private UUID clientId;
    private byte rejectionReason;  // 0 = accepted, >0 = rejection reason
    private String message;
    private int selectedSampleRate;

    public AuthAckPacket() {
    }

    public AuthAckPacket(UUID clientId, byte rejectionReason, String message, int selectedSampleRate) {
        this.clientId = clientId;
        this.rejectionReason = rejectionReason;
        this.message = message;
        this.selectedSampleRate = selectedSampleRate;
    }
    
    /**
     * Convenience constructor for accepted auth
     */
    public static AuthAckPacket accepted(UUID clientId, String message, int selectedSampleRate) {
        return new AuthAckPacket(clientId, REASON_ACCEPTED, message, selectedSampleRate);
    }
    
    /**
     * Convenience constructor for rejected auth
     */
    public static AuthAckPacket rejected(UUID clientId, byte reason, String message, int selectedSampleRate) {
        return new AuthAckPacket(clientId, reason, message, selectedSampleRate);
    }

    public byte[] serialize() {
        ByteBuffer buffer = ByteBuffer.allocate(1024);
        
        // Packet type
        buffer.put(PACKET_TYPE);
        
        // Client ID (UUID)
        buffer.putLong(clientId.getMostSignificantBits());
        buffer.putLong(clientId.getLeastSignificantBits());
        
        // Rejection reason (0 = accepted, >0 = rejection code)
        buffer.put(rejectionReason);
        
        // Message (UTF-8 string with length prefix)
        byte[] messageBytes = message != null ? message.getBytes(StandardCharsets.UTF_8) : new byte[0];
        buffer.putShort((short) messageBytes.length);
        buffer.put(messageBytes);
        
        // Selected sample rate (optional extension)
        buffer.putInt(selectedSampleRate);

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
        
        // Rejection reason
        byte rejectionReason = buffer.get();
        
        // Message
        short messageLength = buffer.getShort();
        byte[] messageBytes = new byte[messageLength];
        buffer.get(messageBytes);
        String message = new String(messageBytes, StandardCharsets.UTF_8);

        int selectedSampleRate = NetworkConfig.DEFAULT_SAMPLE_RATE;
        if (buffer.remaining() >= 4) {
            selectedSampleRate = buffer.getInt();
        }
        
        AuthAckPacket packet = new AuthAckPacket();
        packet.clientId = clientId;
        packet.rejectionReason = rejectionReason;
        packet.message = message;
        packet.selectedSampleRate = selectedSampleRate;
        return packet;
    }

    public UUID getClientId() {
        return clientId;
    }

    public byte getRejectionReason() {
        return rejectionReason;
    }

    public boolean isAccepted() {
        return rejectionReason == REASON_ACCEPTED;
    }

    public String getMessage() {
        return message;
    }

    public int getSelectedSampleRate() {
        return selectedSampleRate;
    }
}
