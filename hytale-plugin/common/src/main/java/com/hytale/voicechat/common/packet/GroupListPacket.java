package com.hytale.voicechat.common.packet;

import com.hytale.voicechat.common.network.NetworkConfig;

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
    private final List<GroupData> groups;
    private final boolean isQuery; // true if this is a query request, false if response

    // Constructor for response packet (with group list)
    public GroupListPacket(UUID serverId, List<GroupData> groupDataList) {
        super(serverId);
        this.isQuery = false;
        this.groups = new ArrayList<>();
        
        if (groupDataList != null) {
            this.groups.addAll(groupDataList);
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
        return new ArrayList<>(groups);
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
            for (GroupData group : groups) {
                byte[] nameBytes = group.name.getBytes(StandardCharsets.UTF_8);
                bufferSize += 16 + 2 + nameBytes.length + 4; // groupId + nameLen + name + memberCount
            }
            
            ByteBuffer buffer = ByteBuffer.allocate(bufferSize);
            buffer.put((byte) 0x08); // Packet type: GROUP_LIST
            buffer.putLong(getSenderId().getMostSignificantBits());
            buffer.putLong(getSenderId().getLeastSignificantBits());
            buffer.put((byte) 0x00); // Flag: is response
            buffer.putShort((short) groups.size());
            
            for (GroupData group : groups) {
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
        if (data == null) {
            throw new IllegalArgumentException("GroupListPacket data is null");
        }

        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        // Header: 1 byte (packetType) + 16 bytes (sender UUID) + 1 byte (flag)
        if (buffer.remaining() < 1 + 16 + 1) {
            throw new IllegalArgumentException("Truncated GroupListPacket: insufficient data for header");
        }

        byte packetType = buffer.get(); // Should be 0x08
        if (packetType != 0x08) {
            throw new IllegalArgumentException("Invalid packet type for GroupListPacket: " + packetType);
        }
        
        long senderMostSig = buffer.getLong();
        long senderLeastSig = buffer.getLong();
        UUID senderId = new UUID(senderMostSig, senderLeastSig);
        
        byte flag = buffer.get();
        
        if (flag == 0x01) {
            // Query packet (no additional payload required)
            return new GroupListPacket(senderId);
        } else {
            // Response packet
            // Need at least 2 bytes for groupCount
            if (buffer.remaining() < 2) {
                throw new IllegalArgumentException("Truncated GroupListPacket: missing group count");
            }

            short groupCount = buffer.getShort();
            if (groupCount < 0) {
                throw new IllegalArgumentException("Invalid GroupListPacket: negative group count");
            }
            
            // Reasonable upper limit to prevent memory exhaustion
            if (groupCount > NetworkConfig.MAX_GROUP_COUNT) {
                throw new IllegalArgumentException("Invalid GroupListPacket: group count exceeds maximum of " + NetworkConfig.MAX_GROUP_COUNT);
            }

            List<GroupData> groupDataList = new ArrayList<>();
            
            for (int i = 0; i < groupCount; i++) {
                // For each group we need at least:
                // 16 bytes (group UUID) + 2 bytes (name length)
                if (buffer.remaining() < 16 + 2) {
                    throw new IllegalArgumentException("Truncated GroupListPacket: insufficient data for group header at index " + i);
                }

                long groupMostSig = buffer.getLong();
                long groupLeastSig = buffer.getLong();
                UUID groupId = new UUID(groupMostSig, groupLeastSig);
                
                short nameLength = buffer.getShort();
                if (nameLength < 0) {
                    throw new IllegalArgumentException("Invalid GroupListPacket: negative name length at index " + i);
                }
                
                // Reasonable upper limit for group name length
                if (nameLength > NetworkConfig.MAX_GROUP_NAME_LENGTH) {
                    throw new IllegalArgumentException("Invalid GroupListPacket: name length exceeds maximum of " + NetworkConfig.MAX_GROUP_NAME_LENGTH + " at index " + i);
                }

                // Now need nameLength bytes for the name and 4 bytes for memberCount
                if (buffer.remaining() < nameLength + 4) {
                    throw new IllegalArgumentException(
                            "Truncated GroupListPacket: insufficient data for group name and member count at index " + i);
                }

                byte[] nameBytes = new byte[nameLength];
                buffer.get(nameBytes);
                String name = new String(nameBytes, StandardCharsets.UTF_8);
                
                int memberCount = buffer.getInt();
                if (memberCount < 0) {
                    throw new IllegalArgumentException("Invalid GroupListPacket: negative member count at index " + i);
                }
                
                // Reasonable upper limit for member count to prevent memory exhaustion
                if (memberCount > NetworkConfig.MAX_GROUP_MEMBER_COUNT) {
                    throw new IllegalArgumentException("Invalid GroupListPacket: member count exceeds maximum of " + NetworkConfig.MAX_GROUP_MEMBER_COUNT + " at index " + i);
                }
                
                groupDataList.add(new GroupData(groupId, name, memberCount));
            }
            
            return new GroupListPacket(senderId, groupDataList);
        }
    }
}
