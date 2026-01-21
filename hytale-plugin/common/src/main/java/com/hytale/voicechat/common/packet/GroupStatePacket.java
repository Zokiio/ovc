package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Packet sent by server to sync group state to clients
 * Direction: Server→Client
 * Packet Type: 0x07
 */
public class GroupStatePacket extends VoicePacket {
    private final UUID groupId;
    private final String groupName;
    private final List<UUID> memberIds;

    public GroupStatePacket(UUID serverId, UUID groupId, String groupName, List<UUID> memberIds) {
        super(serverId);
        this.groupId = groupId;
        this.groupName = groupName;
        this.memberIds = memberIds != null ? memberIds : new ArrayList<>();
    }

    public UUID getGroupId() {
        return groupId;
    }

    public String getGroupName() {
        return groupName;
    }

    public List<UUID> getMemberIds() {
        return memberIds;
    }

    @Override
    public byte[] serialize() {
        byte[] nameBytes = groupName.getBytes(StandardCharsets.UTF_8);
        
        // Calculate buffer size
        int bufferSize = 1 + 16 + 16 + 2 + nameBytes.length + 2 + (memberIds.size() * 16);
        ByteBuffer buffer = ByteBuffer.allocate(bufferSize);
        
        buffer.put((byte) 0x07); // Packet type: GROUP_STATE
        buffer.putLong(getSenderId().getMostSignificantBits());
        buffer.putLong(getSenderId().getLeastSignificantBits());
        buffer.putLong(groupId.getMostSignificantBits());
        buffer.putLong(groupId.getLeastSignificantBits());
        buffer.putShort((short) nameBytes.length);
        buffer.put(nameBytes);
        buffer.putShort((short) memberIds.size());
        
        for (UUID memberId : memberIds) {
            buffer.putLong(memberId.getMostSignificantBits());
            buffer.putLong(memberId.getLeastSignificantBits());
        }
        
        return buffer.array();
    }

    public static GroupStatePacket deserialize(byte[] data) {
        if (data == null) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: data is null");
        }

        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        // Header: 1 byte (packetType) + 16 bytes (server UUID) + 16 bytes (group UUID) + 2 bytes (name length)
        if (buffer.remaining() < 1 + 16 + 16 + 2) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: insufficient data for header");
        }

        byte packetType = buffer.get(); // Should be 0x07
        if (packetType != 0x07) {
            throw new IllegalArgumentException("Invalid packet type for GroupStatePacket: " + packetType);
        }
        
        long serverMostSig = buffer.getLong();
        long serverLeastSig = buffer.getLong();
        UUID serverId = new UUID(serverMostSig, serverLeastSig);
        
        long groupMostSig = buffer.getLong();
        long groupLeastSig = buffer.getLong();
        UUID groupId = new UUID(groupMostSig, groupLeastSig);
        
        short nameLength = buffer.getShort();
        if (nameLength < 0) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: negative group name length");
        }
        
        // Reasonable upper limit for group name length to prevent memory exhaustion
        if (nameLength > 1000) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: group name length exceeds maximum of 1000");
        }

        if (buffer.remaining() < nameLength) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: insufficient data for group name");
        }

        byte[] nameBytes = new byte[nameLength];
        buffer.get(nameBytes);
        String groupName = new String(nameBytes, StandardCharsets.UTF_8);
        
        if (buffer.remaining() < 2) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: insufficient data for member count");
        }

        short memberCount = buffer.getShort();
        if (memberCount < 0) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: negative member count");
        }
        
        // Reasonable upper limit for member count to prevent memory exhaustion
        if (memberCount > 10000) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: member count exceeds maximum of 10000");
        }

        // Check if we have enough data for all members
        if (buffer.remaining() < memberCount * 16) {
            throw new IllegalArgumentException("Malformed GroupStatePacket: insufficient data for all members");
        }

        List<UUID> memberIds = new ArrayList<>(memberCount);
        
        for (int i = 0; i < memberCount; i++) {
            long memberMostSig = buffer.getLong();
            long memberLeastSig = buffer.getLong();
            memberIds.add(new UUID(memberMostSig, memberLeastSig));
        }
        
        return new GroupStatePacket(serverId, groupId, groupName, memberIds);
    }
}
