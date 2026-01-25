package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;

/**
 * Packet sent by server to notify clients of graceful shutdown
 */
public class ServerShutdownPacket {
    private static final byte PACKET_TYPE = 0x09; // Avoid conflict with test audio (0x05)
    private String reason;

    public ServerShutdownPacket() {
        this.reason = "Server shutting down";
    }

    public ServerShutdownPacket(String reason) {
        this.reason = reason != null ? reason : "Server shutting down";
    }

    public byte[] serialize() {
        // Encode reason as UTF-8
        byte[] reasonBytes = reason.getBytes(StandardCharsets.UTF_8);

        // Clamp length to what fits into a Java short to avoid overflow in the length prefix
        int reasonLength = Math.min(reasonBytes.length, Short.MAX_VALUE);

        // Allocate buffer exactly large enough for: 1 byte type + 2 bytes length + reason bytes
        ByteBuffer buffer = ByteBuffer.allocate(1 + 2 + reasonLength);

        // Packet type
        buffer.put(PACKET_TYPE);

        // Reason (UTF-8 string with length prefix)
        buffer.putShort((short) reasonLength);
        buffer.put(reasonBytes, 0, reasonLength);
        
        // Return trimmed array
        byte[] data = new byte[buffer.position()];
        System.arraycopy(buffer.array(), 0, data, 0, buffer.position());
        return data;
    }

    public static ServerShutdownPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        // Skip packet type byte
        buffer.get();
        
        // Reason
        short reasonLength = buffer.getShort();

        // Validate reason length to prevent excessive allocation or buffer underflow
        if (reasonLength < 0) {
            throw new IllegalArgumentException("Invalid reason length: " + reasonLength);
        }

        final int MAX_REASON_LENGTH = 1024;
        if (reasonLength > MAX_REASON_LENGTH) {
            throw new IllegalArgumentException("Reason length exceeds maximum allowed: " + reasonLength);
        }

        if (buffer.remaining() < reasonLength) {
            throw new IllegalArgumentException("Not enough data to read reason: remaining=" 
                    + buffer.remaining() + ", expected=" + reasonLength);
        }
        
        byte[] reasonBytes = new byte[reasonLength];
        buffer.get(reasonBytes);
        String reason = new String(reasonBytes, StandardCharsets.UTF_8);
        
        return new ServerShutdownPacket(reason);
    }

    public String getReason() {
        return reason;
    }
}
