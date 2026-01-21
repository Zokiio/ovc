package com.hytale.voicechat.common.model;

import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

/**
 * Represents a voice group for non-spatial group communication
 */
public class Group {
    private final UUID groupId;
    private final String name;
    private final Set<UUID> members;
    private final boolean isPermanent;
    private final long createdAt;

    public Group(UUID groupId, String name, boolean isPermanent) {
        this.groupId = groupId;
        this.name = name;
        this.isPermanent = isPermanent;
        this.members = new HashSet<>();
        this.createdAt = System.currentTimeMillis();
    }

    public UUID getGroupId() {
        return groupId;
    }

    public String getName() {
        return name;
    }

    public Set<UUID> getMembers() {
        return members;
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

    @Override
    public String toString() {
        return "Group{" +
                "groupId=" + groupId +
                ", name='" + name + '\'' +
                ", members=" + members.size() +
                ", isPermanent=" + isPermanent +
                '}';
    }
}
