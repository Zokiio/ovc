package com.hytale.voicechat.plugin;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hytale.voicechat.common.model.Group;
import com.hytale.voicechat.common.network.NetworkConfig;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages group voice chat operations and state
 * Handles creation, joining, leaving, and cleanup of voice groups
 */
public class GroupManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final int MIN_GROUP_NAME_LENGTH = 3;
    private static final String GROUP_NAME_PATTERN = "^[a-zA-Z0-9 -]+$"; // Alphanumeric, spaces, and hyphens

    private final Map<UUID, Group> groups = new ConcurrentHashMap<>();
    private final Map<UUID, UUID> playerGroupMapping = new ConcurrentHashMap<>(); // playerId -> groupId

    /**
     * Create a new voice group
     * 
     * @param groupName The name of the group
     * @param isPermanent Whether the group persists when empty
     * @return The created Group, or null if validation fails
     */
    public synchronized Group createGroup(String groupName, boolean isPermanent) {
        // Validate group name
        if (!isValidGroupName(groupName)) {
            logger.atWarning().log("Invalid group name: " + groupName);
            return null;
        }

        // Check for duplicates (atomically within synchronized block)
        if (groupNameExists(groupName)) {
            logger.atWarning().log("Group already exists with name: " + groupName);
            return null;
        }

        UUID groupId = UUID.randomUUID();
        Group group = new Group(groupId, groupName, isPermanent);
        groups.put(groupId, group);
        
        logger.atInfo().log("Created group: " + groupName + " (permanent=" + isPermanent + ")");
        return group;
    }

    /**
     * Join a player to an existing group
     * 
     * @param playerId The player joining
     * @param groupId The group to join
     * @return true if successful, false otherwise
     */
    public synchronized boolean joinGroup(UUID playerId, UUID groupId) {
        Group group = groups.get(groupId);
        if (group == null) {
            logger.atWarning().log("Group not found: " + groupId);
            return false;
        }

        // Remove from previous group if any
        UUID previousGroupId = playerGroupMapping.get(playerId);
        if (previousGroupId != null && !previousGroupId.equals(groupId)) {
            leaveGroup(playerId);
            // Re-check if the target group still exists after leaving the previous group
            group = groups.get(groupId);
            if (group == null) {
                logger.atWarning().log("Group no longer exists: " + groupId);
                return false;
            }
        }

        group.addMember(playerId);
        playerGroupMapping.put(playerId, groupId);
        
        logger.atInfo().log("Player " + playerId + " joined group " + group.getName());
        return true;
    }

    /**
     * Remove a player from their current group
     * 
     * @param playerId The player leaving
     * @return true if successful, false if player was not in a group
     */
    public synchronized boolean leaveGroup(UUID playerId) {
        UUID groupId = playerGroupMapping.remove(playerId);
        if (groupId == null) {
            return false; // Player wasn't in a group
        }

        Group group = groups.get(groupId);
        if (group != null) {
            group.removeMember(playerId);
            logger.atInfo().log("Player " + playerId + " left group " + group.getName());

            // Auto-disband non-permanent empty groups
            if (group.isEmpty() && !group.isPermanent()) {
                groups.remove(groupId);
                logger.atInfo().log("Group auto-disbanded: " + group.getName());
            }
        }

        return true;
    }

    /**
     * Get the group a player is currently in
     * 
     * @param playerId The player
     * @return The Group, or null if not in any group
     */
    public Group getPlayerGroup(UUID playerId) {
        UUID groupId = playerGroupMapping.get(playerId);
        return groupId != null ? groups.get(groupId) : null;
    }

    /**
     * Get a group by ID
     * 
     * @param groupId The group ID
     * @return The Group, or null if not found
     */
    public Group getGroup(UUID groupId) {
        return groups.get(groupId);
    }

    /**
     * Get all available groups
     * 
     * @return List of all groups
     */
    public List<Group> listGroups() {
        return new ArrayList<>(groups.values());
    }

    /**
     * Check if a group name already exists
     * 
     * @param groupName The group name to check
     * @return true if group exists, false otherwise
     */
    private boolean groupNameExists(String groupName) {
        return groups.values().stream()
                .anyMatch(g -> g.getName().equalsIgnoreCase(groupName));
    }

    /**
     * Validate group name format and length
     * 
     * @param groupName The group name to validate
     * @return true if valid, false otherwise
     */
    private boolean isValidGroupName(String groupName) {
        if (groupName == null || groupName.isEmpty()) {
            return false;
        }

        if (groupName.length() < MIN_GROUP_NAME_LENGTH || groupName.length() > NetworkConfig.MAX_GROUP_NAME_LENGTH) {
            return false;
        }

        return groupName.matches(GROUP_NAME_PATTERN);
    }

    /**
     * Handle player disconnect - remove them from their group
     * 
     * @param playerId The player disconnecting
     */
    public void handlePlayerDisconnect(UUID playerId) {
        leaveGroup(playerId);
    }

    /**
     * Shutdown the group manager
     * Clears all non-permanent groups
     */
    public void shutdown() {
        logger.atInfo().log("Shutting down GroupManager");
        groups.entrySet().removeIf(entry -> !entry.getValue().isPermanent());
        playerGroupMapping.clear();
        logger.atInfo().log("GroupManager shutdown complete");
    }

    /**
     * Get statistics about groups
     * 
     * @return String with group statistics
     */
    public String getStatistics() {
        long permanentCount = groups.values().stream().filter(Group::isPermanent).count();
        long totalMembers = groups.values().stream().mapToLong(g -> g.getMemberCount()).sum();
        
        return String.format("Groups: %d (permanent: %d), Total members: %d",
                groups.size(), permanentCount, totalMembers);
    }
}
