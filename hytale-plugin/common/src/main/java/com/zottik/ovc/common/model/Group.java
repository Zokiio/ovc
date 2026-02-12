package com.zottik.ovc.common.model;

import com.zottik.ovc.common.network.NetworkConfig;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Represents a voice group for non-spatial group communication
 */
public class Group {
    private final UUID groupId;
    private final String name;
    private final Set<UUID> members;
    private volatile boolean isPermanent;
    private final long createdAt;
    private UUID creatorUuid;
    private boolean isIsolated;
    private GroupSettings settings;
    private volatile String passwordHash;

    public Group(UUID groupId, String name, boolean isPermanent, UUID creatorUuid) {
        this(groupId, name, isPermanent, creatorUuid, new GroupSettings());
    }

    public Group(UUID groupId, String name, boolean isPermanent, UUID creatorUuid, GroupSettings settings) {
        this.groupId = groupId;
        this.name = name;
        this.isPermanent = isPermanent;
        this.creatorUuid = creatorUuid;
        this.members = ConcurrentHashMap.newKeySet();
        this.createdAt = System.currentTimeMillis();
        this.isIsolated = NetworkConfig.DEFAULT_GROUP_IS_ISOLATED;
        this.settings = settings != null ? settings : new GroupSettings();
    }

    public UUID getGroupId() {
        return groupId;
    }

    public String getName() {
        return name;
    }

    public Set<UUID> getMembers() {
        return Collections.unmodifiableSet(members);
    }

    public boolean isPermanent() {
        return isPermanent;
    }

    public void setPermanent(boolean permanent) {
        this.isPermanent = permanent;
    }

    /**
     * Set the group password (hashed with SHA-256).
     * Pass null to remove the password.
     */
    public void setPassword(String plainPassword) {
        if (plainPassword == null || plainPassword.isEmpty()) {
            this.passwordHash = null;
        } else {
            this.passwordHash = hashPassword(plainPassword);
        }
    }

    /**
     * Check if this group has a password set.
     */
    public boolean hasPassword() {
        return passwordHash != null && !passwordHash.isEmpty();
    }

    /**
     * Validate a plaintext password against the stored hash.
     */
    public boolean checkPassword(String plainPassword) {
        if (!hasPassword()) {
            return true; // No password required
        }
        if (plainPassword == null || plainPassword.isEmpty()) {
            return false;
        }
        return passwordHash.equals(hashPassword(plainPassword));
    }

    private static String hashPassword(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(password.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : hash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void addMember(UUID playerId) {
        members.add(playerId);
    }

    public void removeMember(UUID playerId) {
        members.remove(playerId);
    }

    public boolean hasMember(UUID playerId) {
        return members.contains(playerId);
    }

    public int getMemberCount() {
        return members.size();
    }

    public boolean isEmpty() {
        return members.isEmpty();
    }

    public UUID getCreatorUuid() {
        return creatorUuid;
    }

    public void setCreator(UUID creatorUuid) {
        this.creatorUuid = creatorUuid;
    }

    public boolean isCreator(UUID playerId) {
        return creatorUuid != null && creatorUuid.equals(playerId);
    }

    public boolean isIsolated() {
        return isIsolated;
    }

    public void setIsolated(boolean isolated) {
        this.isIsolated = isolated;
    }

    public GroupSettings getSettings() {
        return settings;
    }

    public void setSettings(GroupSettings settings) {
        this.settings = settings != null ? settings : new GroupSettings();
    }

    @Override
    public String toString() {
        return "Group{" +
                "groupId=" + groupId +
                ", name='" + name + '\'' +
                ", members=" + members.size() +
                ", isPermanent=" + isPermanent +
                ", hasPassword=" + hasPassword() +
                ", creatorUuid=" + creatorUuid +
                ", isIsolated=" + isIsolated +
                ", settings=" + settings +
                '}';
    }
}
