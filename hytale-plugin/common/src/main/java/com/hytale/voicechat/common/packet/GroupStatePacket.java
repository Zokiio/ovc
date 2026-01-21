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
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
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
        byte[] nameBytes = new byte[nameLength];
        buffer.get(nameBytes);
        String groupName = new String(nameBytes, StandardCharsets.UTF_8);
        
        short memberCount = buffer.getShort();
        List<UUID> memberIds = new ArrayList<>(memberCount);
        
        for (int i = 0; i < memberCount; i++) {
            long memberMostSig = buffer.getLong();
            long memberLeastSig = buffer.getLong();
            memberIds.add(new UUID(memberMostSig, memberLeastSig));
        }
        
        return new GroupStatePacket(serverId, groupId, groupName, memberIds);
    }
}
