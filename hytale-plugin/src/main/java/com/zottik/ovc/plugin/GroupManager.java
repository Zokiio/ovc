package com.zottik.ovc.plugin;

import com.hypixel.hytale.logger.HytaleLogger;
import com.zottik.ovc.common.model.Group;
import com.zottik.ovc.common.model.GroupSettings;
import com.zottik.ovc.common.network.NetworkConfig;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

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
    
    // Event listeners for group changes
    public interface GroupEventListener {
        void onGroupCreated(Group group, UUID creatorId);
        void onPlayerJoinedGroup(UUID playerId, Group group);
        void onPlayerLeftGroup(UUID playerId, Group group, boolean groupDeleted);
        void onGroupDeleted(Group group);
    }
    
    private final List<GroupEventListener> eventListeners = new CopyOnWriteArrayList<>();
    
    /**
     * Register a listener for group events
     */
    public void registerGroupEventListener(GroupEventListener listener) {
        if (!eventListeners.contains(listener)) {
            eventListeners.add(listener);
            logger.atFine().log("Registered group event listener: " + listener.getClass().getSimpleName());
        }
    }
    
    /**
     * Unregister a listener for group events
     */
    public void unregisterGroupEventListener(GroupEventListener listener) {
        eventListeners.remove(listener);
    }

    /**
     * Create a new voice group
     * 
     * @param groupName The name of the group
     * @param isPermanent Whether the group persists when empty
     * @param creatorUuid The UUID of the player creating the group
     * @return The created Group, or null if validation fails
     */
    public synchronized Group createGroup(String groupName, boolean isPermanent, UUID creatorUuid) {
        return createGroup(groupName, isPermanent, creatorUuid, new GroupSettings(), null);
    }

    /**
     * Create a new voice group with custom settings
     * 
     * @param groupName The name of the group
     * @param isPermanent Whether the group persists when empty
     * @param creatorUuid The UUID of the player creating the group
     * @param settings Custom group settings
     * @return The created Group, or null if validation fails
     */
    public synchronized Group createGroup(String groupName, boolean isPermanent, UUID creatorUuid, GroupSettings settings) {
        return createGroup(groupName, isPermanent, creatorUuid, settings, null);
    }

    /**
     * Create a new voice group with custom settings and optional isolation mode.
     *
     * @param groupName The name of the group
     * @param isPermanent Whether the group persists when empty
     * @param creatorUuid The UUID of the player creating the group
     * @param settings Custom group settings
     * @param isIsolated Optional isolation mode override
     * @return The created Group, or null if validation fails
     */
    public synchronized Group createGroup(
            String groupName,
            boolean isPermanent,
            UUID creatorUuid,
            GroupSettings settings,
            Boolean isIsolated
    ) {
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
        Group group = new Group(groupId, groupName, isPermanent, creatorUuid, settings);
        if (isIsolated != null) {
            group.setIsolated(isIsolated);
        }
        groups.put(groupId, group);
        
        logger.atInfo().log("Created group: " + groupName + " (permanent=" + isPermanent + ", creator=" + creatorUuid + ", settings=" + settings + ", isolated=" + group.isIsolated() + ")");
        
        // Notify listeners
        eventListeners.forEach(listener -> listener.onGroupCreated(group, creatorUuid));
        
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
            // Re-entrant synchronized call: safe because Java intrinsic locks are reentrant
            leaveGroup(playerId);
            // Re-check if the target group still exists after leaving the previous group
            final Group updatedGroup = groups.get(groupId);
            if (updatedGroup == null) {
                logger.atWarning().log("Group no longer exists: " + groupId);
                return false;
            }
            group = updatedGroup;
        }

        final Group finalGroup = group;
        finalGroup.addMember(playerId);
        playerGroupMapping.put(playerId, groupId);
        
        logger.atInfo().log("Player " + playerId + " joined group " + finalGroup.getName());
        
        // Notify listeners
        eventListeners.forEach(listener -> listener.onPlayerJoinedGroup(playerId, finalGroup));
        
        return true;
    }

    /**
     * Remove a player from their current group
     * 
     * @param playerId The player leaving
     * @return The UUID of the new owner if ownership was transferred, null otherwise
     */
    public synchronized UUID leaveGroup(UUID playerId) {
        UUID groupId = playerGroupMapping.remove(playerId);
        if (groupId == null) {
            return null; // Player wasn't in a group
        }

        Group group = groups.get(groupId);
        if (group != null) {
            UUID newOwner = null;
            
            // Check if leaving player is the creator and transfer ownership
            if (group.isCreator(playerId)) {
                // Get first remaining member (if any)
                UUID firstMember = group.getMembers().stream()
                    .filter(uuid -> !uuid.equals(playerId))
                    .findFirst()
                    .orElse(null);
                
                if (firstMember != null) {
                    group.setCreator(firstMember);
                    newOwner = firstMember;
                    logger.atInfo().log("Transferred ownership of group " + group.getName() + " to " + firstMember);
                }
            }
            
            group.removeMember(playerId);
            logger.atInfo().log("Player " + playerId + " left group " + group.getName());

            // Auto-disband non-permanent empty groups
            final boolean groupDeleted;
            if (group.isEmpty() && !group.isPermanent()) {
                groups.remove(groupId);
                logger.atInfo().log("Group auto-disbanded: " + group.getName());
                groupDeleted = true;
            } else {
                groupDeleted = false;
            }
            
            // Notify listeners
            final Group finalGroup = group;
            eventListeners.forEach(listener -> listener.onPlayerLeftGroup(playerId, finalGroup, groupDeleted));
            if (groupDeleted) {
                eventListeners.forEach(listener -> listener.onGroupDeleted(finalGroup));
            }
            
            return newOwner;
        }

        return null;
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
     * Get members of a group
     * 
     * @param groupId The group ID
     * @return List of member UUIDs, or empty list if group not found
     */
    public List<UUID> getGroupMembers(UUID groupId) {
        Group group = groups.get(groupId);
        if (group == null) {
            return new ArrayList<>();
        }
        return new ArrayList<>(group.getMembers());
    }

    /**
     * Update group settings (for group API)
     * Only the group creator can modify settings
     * 
     * @param groupId The group to update
     * @param requesterId The player requesting the change
     * @param newSettings The new group settings
     * @return true if successful, false if permission denied or group not found
     */
    public synchronized boolean updateGroupSettings(UUID groupId, UUID requesterId, GroupSettings newSettings) {
        Group group = groups.get(groupId);
        if (group == null) {
            logger.atWarning().log("Group not found: " + groupId);
            return false;
        }

        // Check if requester is the creator
        if (!group.isCreator(requesterId)) {
            logger.atWarning().log("Player " + requesterId + " attempted to modify group " + group.getName() + " without permission");
            return false;
        }

        group.setSettings(newSettings);
        logger.atInfo().log("Updated group " + group.getName() + " settings: " + newSettings);
        
        return true;
    }

    /**
     * Update group isolation settings (legacy method)
     * Only the group creator can modify settings
     * 
     * @param groupId The group to update
     * @param requesterId The player requesting the change
     * @param isIsolated Whether to enable isolation mode
     * @return true if successful, false if permission denied or group not found
     */
    public synchronized boolean updateGroupSettings(UUID groupId, UUID requesterId, boolean isIsolated) {
        Group group = groups.get(groupId);
        if (group == null) {
            logger.atWarning().log("Group not found: " + groupId);
            return false;
        }

        // Check if requester is the creator
        if (!group.isCreator(requesterId)) {
            logger.atWarning().log("Player " + requesterId + " attempted to modify group " + group.getName() + " without permission");
            return false;
        }

        group.setIsolated(isIsolated);
        logger.atInfo().log("Updated group " + group.getName() + " settings: isolated=" + isIsolated);
        
        return true;
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
