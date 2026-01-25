package com.hytale.voicechat.common.model;

import com.hytale.voicechat.common.network.NetworkConfig;

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
    private final boolean isPermanent;
    private final long createdAt;
    private UUID creatorUuid;
    private boolean isIsolated;

    public Group(UUID groupId, String name, boolean isPermanent, UUID creatorUuid) {
        this.groupId = groupId;
        this.name = name;
        this.isPermanent = isPermanent;
        this.creatorUuid = creatorUuid;
        this.members = ConcurrentHashMap.newKeySet();
        this.createdAt = System.currentTimeMillis();
        this.isIsolated = NetworkConfig.DEFAULT_GROUP_IS_ISOLATED;
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

    @Override
    public String toString() {
        return "Group{" +
                "groupId=" + groupId +
                ", name='" + name + '\'' +
                ", members=" + members.size() +
                ", isPermanent=" + isPermanent +
                ", creatorUuid=" + creatorUuid +
                ", isIsolated=" + isIsolated +
                '}';
    }
}
