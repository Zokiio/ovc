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
        ByteBuffer buffer = ByteBuffer.allocate(512);
        
        // Packet type
        buffer.put(PACKET_TYPE);
        
        // Reason (UTF-8 string with length prefix)
        byte[] reasonBytes = reason.getBytes(StandardCharsets.UTF_8);
        buffer.putShort((short) reasonBytes.length);
        buffer.put(reasonBytes);
        
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
        byte[] reasonBytes = new byte[reasonLength];
        buffer.get(reasonBytes);
        String reason = new String(reasonBytes, StandardCharsets.UTF_8);
        
        return new ServerShutdownPacket(reason);
    }

    public String getReason() {
        return reason;
    }
}
