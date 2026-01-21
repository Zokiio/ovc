package com.hytale.voicechat.common.packet;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Packet for querying and listing available groups
 * Direction: Client→Server (query), Server→Client (response)
 * Packet Type: 0x08
 */
public class GroupListPacket extends VoicePacket {
    private static class GroupInfo {
        final UUID groupId;
        final String name;
        final int memberCount;

        GroupInfo(UUID groupId, String name, int memberCount) {
            this.groupId = groupId;
            this.name = name;
            this.memberCount = memberCount;
        }
    }

    private final List<GroupInfo> groups;
    private final boolean isQuery; // true if this is a query request, false if response

    // Constructor for response packet (with group list)
    public GroupListPacket(UUID serverId, List<GroupData> groupDataList) {
        super(serverId);
        this.isQuery = false;
        this.groups = new ArrayList<>();
        
        if (groupDataList != null) {
            for (GroupData data : groupDataList) {
                this.groups.add(new GroupInfo(data.groupId, data.name, data.memberCount));
            }
        }
    }

    // Constructor for query packet (no group list)
    public GroupListPacket(UUID clientId) {
        super(clientId);
        this.isQuery = true;
        this.groups = new ArrayList<>();
    }

    /**
     * Data class for group information
     */
    public static class GroupData {
        public final UUID groupId;
        public final String name;
        public final int memberCount;

        public GroupData(UUID groupId, String name, int memberCount) {
            this.groupId = groupId;
            this.name = name;
            this.memberCount = memberCount;
        }
    }

    public List<GroupData> getGroups() {
        List<GroupData> result = new ArrayList<>();
        for (GroupInfo info : groups) {
            result.add(new GroupData(info.groupId, info.name, info.memberCount));
        }
        return result;
    }

    public boolean isQuery() {
        return isQuery;
    }

    @Override
    public byte[] serialize() {
        if (isQuery) {
            // Query packet: minimal data
            ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 1);
            buffer.put((byte) 0x08); // Packet type: GROUP_LIST
            buffer.putLong(getSenderId().getMostSignificantBits());
            buffer.putLong(getSenderId().getLeastSignificantBits());
            buffer.put((byte) 0x01); // Flag: is query
            return buffer.array();
        } else {
            // Response packet with group list
            int bufferSize = 1 + 16 + 1 + 2; // header + flags + count
            for (GroupInfo group : groups) {
                byte[] nameBytes = group.name.getBytes(StandardCharsets.UTF_8);
                bufferSize += 16 + 2 + nameBytes.length + 4; // groupId + nameLen + name + memberCount
            }
            
            ByteBuffer buffer = ByteBuffer.allocate(bufferSize);
            buffer.put((byte) 0x08); // Packet type: GROUP_LIST
            buffer.putLong(getSenderId().getMostSignificantBits());
            buffer.putLong(getSenderId().getLeastSignificantBits());
            buffer.put((byte) 0x00); // Flag: is response
            buffer.putShort((short) groups.size());
            
            for (GroupInfo group : groups) {
                byte[] nameBytes = group.name.getBytes(StandardCharsets.UTF_8);
                buffer.putLong(group.groupId.getMostSignificantBits());
                buffer.putLong(group.groupId.getLeastSignificantBits());
                buffer.putShort((short) nameBytes.length);
                buffer.put(nameBytes);
                buffer.putInt(group.memberCount);
            }
            
            return buffer.array();
        }
    }

    public static GroupListPacket deserialize(byte[] data) {
        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        byte packetType = buffer.get(); // Should be 0x08
        if (packetType != 0x08) {
            throw new IllegalArgumentException("Invalid packet type for GroupListPacket: " + packetType);
        }
        
        long senderMostSig = buffer.getLong();
        long senderLeastSig = buffer.getLong();
        UUID senderId = new UUID(senderMostSig, senderLeastSig);
        
        byte flag = buffer.get();
        
        if (flag == 0x01) {
            // Query packet
            return new GroupListPacket(senderId);
        } else {
            // Response packet
            short groupCount = buffer.getShort();
            List<GroupData> groupDataList = new ArrayList<>();
            
            for (int i = 0; i < groupCount; i++) {
                long groupMostSig = buffer.getLong();
                long groupLeastSig = buffer.getLong();
                UUID groupId = new UUID(groupMostSig, groupLeastSig);
                
                short nameLength = buffer.getShort();
                byte[] nameBytes = new byte[nameLength];
                buffer.get(nameBytes);
                String name = new String(nameBytes, StandardCharsets.UTF_8);
                
                int memberCount = buffer.getInt();
                
                groupDataList.add(new GroupData(groupId, name, memberCount));
            }
            
            return new GroupListPacket(senderId, groupDataList);
        }
    }
}
