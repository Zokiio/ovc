package com.hytale.voicechat.common.packet;

import com.hytale.voicechat.common.network.NetworkConfig;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Packet for group management operations (create, join, leave)
 * Direction: Client→Server
 * Packet Type: 0x06
 */
public class GroupManagementPacket extends VoicePacket {
    public enum OperationType {
        CREATE((byte) 0x01),
        JOIN((byte) 0x02),
        LEAVE((byte) 0x03),
        UPDATE_SETTINGS((byte) 0x04);

        private final byte value;

        OperationType(byte value) {
            this.value = value;
        }

        public byte getValue() {
            return value;
        }

        public static OperationType fromValue(byte value) {
            for (OperationType type : OperationType.values()) {
                if (type.value == value) {
                    return type;
                }
            }
            throw new IllegalArgumentException("Unknown operation type: " + value);
        }
    }

    private final OperationType operation;
    private final UUID groupId;
    private final String groupName; // Used for CREATE operation
    private final boolean isPermanent; // Used for CREATE operation (admin-only)
    private final Boolean isIsolated; // Used for UPDATE_SETTINGS operation (null for other ops)

    // Constructor for JOIN/LEAVE operations
    public GroupManagementPacket(UUID playerId, OperationType operation, UUID groupId) {
        super(playerId);
        this.operation = operation;
        this.groupId = groupId;
        this.groupName = null;
        this.isPermanent = false;
        this.isIsolated = null;
    }

    // Constructor for CREATE operation
    public GroupManagementPacket(UUID playerId, String groupName, boolean isPermanent) {
        super(playerId);
        this.operation = OperationType.CREATE;
        this.groupId = null;
        this.groupName = groupName;
        this.isPermanent = isPermanent;
        this.isIsolated = null;
    }

    // Constructor for UPDATE_SETTINGS operation
    public GroupManagementPacket(UUID playerId, UUID groupId, boolean isIsolated) {
        super(playerId);
        this.operation = OperationType.UPDATE_SETTINGS;
        this.groupId = groupId;
        this.groupName = null;
        this.isPermanent = false;
        this.isIsolated = isIsolated;
    }

    public OperationType getOperation() {
        return operation;
    }

    public UUID getGroupId() {
        return groupId;
    }

    public String getGroupName() {
        return groupName;
    }

    public boolean isPermanent() {
        return isPermanent;
    }

    public Boolean isIsolated() {
        return isIsolated;
    }

    @Override
    public byte[] serialize() {
        ByteBuffer buffer;
        
        if (operation == OperationType.CREATE) {
            byte[] nameBytes = groupName.getBytes(StandardCharsets.UTF_8);
            buffer = ByteBuffer.allocate(1 + 16 + 1 + 1 + 2 + nameBytes.length);
            buffer.put((byte) 0x06); // Packet type: GROUP_MANAGEMENT
            buffer.putLong(getSenderId().getMostSignificantBits());
            buffer.putLong(getSenderId().getLeastSignificantBits());
            buffer.put(operation.getValue());
            buffer.put(isPermanent ? (byte) 0x01 : (byte) 0x00);
            buffer.putShort((short) nameBytes.length);
            buffer.put(nameBytes);
        } else if (operation == OperationType.UPDATE_SETTINGS) {
            buffer = ByteBuffer.allocate(1 + 16 + 1 + 16 + 1);
            buffer.put((byte) 0x06); // Packet type: GROUP_MANAGEMENT
            buffer.putLong(getSenderId().getMostSignificantBits());
            buffer.putLong(getSenderId().getLeastSignificantBits());
            buffer.put(operation.getValue());
            buffer.putLong(groupId.getMostSignificantBits());
            buffer.putLong(groupId.getLeastSignificantBits());
            buffer.put(isIsolated ? (byte) 0x01 : (byte) 0x00);
        } else {
            // JOIN or LEAVE
            buffer = ByteBuffer.allocate(1 + 16 + 1 + 16);
            buffer.put((byte) 0x06); // Packet type: GROUP_MANAGEMENT
            buffer.putLong(getSenderId().getMostSignificantBits());
            buffer.putLong(getSenderId().getLeastSignificantBits());
            buffer.put(operation.getValue());
            buffer.putLong(groupId.getMostSignificantBits());
            buffer.putLong(groupId.getLeastSignificantBits());
        }
        
        return buffer.array();
    }

    public static GroupManagementPacket deserialize(byte[] data) {
        if (data == null) {
            throw new IllegalArgumentException("Malformed GroupManagementPacket: data is null");
        }

        ByteBuffer buffer = ByteBuffer.wrap(data);
        
        // Header: 1 byte (packetType) + 16 bytes (player UUID) + 1 byte (operation)
        if (buffer.remaining() < 1 + 16 + 1) {
            throw new IllegalArgumentException("Malformed GroupManagementPacket: insufficient data for header");
        }

        byte packetType = buffer.get(); // Should be 0x06
        if (packetType != 0x06) {
            throw new IllegalArgumentException("Invalid packet type for GroupManagementPacket: " + packetType);
        }
        
        long mostSig = buffer.getLong();
        long leastSig = buffer.getLong();
        UUID playerId = new UUID(mostSig, leastSig);
        
        byte opValue = buffer.get();
        OperationType operation = OperationType.fromValue(opValue);
        
        if (operation == OperationType.CREATE) {
            // CREATE requires: 1 byte (isPermanent) + 2 bytes (nameLength)
            if (buffer.remaining() < 1 + 2) {
                throw new IllegalArgumentException("Malformed GroupManagementPacket: insufficient data for CREATE operation");
            }

            byte isPermanentByte = buffer.get();
            boolean isPermanent = isPermanentByte == 0x01;
            
            short nameLength = buffer.getShort();
            if (nameLength < 0) {
                throw new IllegalArgumentException("Malformed GroupManagementPacket: negative name length");
            }
            
            // Reasonable upper limit for group name length to prevent memory exhaustion
            if (nameLength > NetworkConfig.MAX_GROUP_NAME_LENGTH) {
                throw new IllegalArgumentException("Malformed GroupManagementPacket: name length exceeds maximum of " + NetworkConfig.MAX_GROUP_NAME_LENGTH);
            }

            if (buffer.remaining() < nameLength) {
                throw new IllegalArgumentException("Malformed GroupManagementPacket: insufficient data for group name");
            }

            byte[] nameBytes = new byte[nameLength];
            buffer.get(nameBytes);
            String groupName = new String(nameBytes, StandardCharsets.UTF_8);
            
            return new GroupManagementPacket(playerId, groupName, isPermanent);
        } else if (operation == OperationType.UPDATE_SETTINGS) {
            // UPDATE_SETTINGS requires: 16 bytes (group UUID) + 1 byte (isolation setting)
            if (buffer.remaining() < 16 + 1) {
                throw new IllegalArgumentException("Malformed GroupManagementPacket: insufficient data for UPDATE_SETTINGS operation");
            }

            long groupMostSig = buffer.getLong();
            long groupLeastSig = buffer.getLong();
            UUID groupId = new UUID(groupMostSig, groupLeastSig);
            
            boolean isIsolated = buffer.get() == (byte) 0x01;
            
            return new GroupManagementPacket(playerId, groupId, isIsolated);
        } else {
            // JOIN or LEAVE require: 16 bytes (group UUID)
            if (buffer.remaining() < 16) {
                throw new IllegalArgumentException("Malformed GroupManagementPacket: insufficient data for group UUID");
            }

            long groupMostSig = buffer.getLong();
            long groupLeastSig = buffer.getLong();
            UUID groupId = new UUID(groupMostSig, groupLeastSig);
            
            return new GroupManagementPacket(playerId, operation, groupId);
        }
    }
}
