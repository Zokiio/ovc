package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.zottik.ovc.common.signaling.SignalingMessage;
import com.hypixel.hytale.logger.HytaleLogger;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages group membership for WebRTC clients
 * Tracks which clients are in which groups and provides broadcast utilities
 */
public class GroupStateManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    // groupId -> set of connected WebRTCClients in that group
    private final Map<UUID, Set<WebRTCClient>> groupMembers = new ConcurrentHashMap<>();
    // clientId -> groupId mapping for quick lookup
    private final Map<UUID, UUID> clientGroupMapping = new ConcurrentHashMap<>();

    /**
     * Add a client to a group
     */
    public void addClientToGroup(UUID clientId, WebRTCClient client, UUID groupId) {
        // Remove from old group if exists (must be done before updating mapping)
        UUID previousGroupId = clientGroupMapping.get(clientId);
        if (previousGroupId != null && !previousGroupId.equals(groupId)) {
            removeClientFromGroup(clientId, previousGroupId);
        }

        // Update mapping to new group
        clientGroupMapping.put(clientId, groupId);

        // Add to new group
        groupMembers.computeIfAbsent(groupId, k -> ConcurrentHashMap.newKeySet())
                .add(client);
        
        logger.atFine().log("Added client " + clientId + " to group " + groupId);
    }

    /**
     * Remove a client from a group
     */
    public void removeClientFromGroup(UUID clientId, UUID groupId) {
        Set<WebRTCClient> members = groupMembers.get(groupId);
        if (members != null) {
            members.removeIf(client -> client.getClientId().equals(clientId));
            if (members.isEmpty()) {
                groupMembers.remove(groupId);
            }
        }
        
        // Only remove the client->group mapping if it still points to this groupId.
        // This prevents accidentally deleting a new mapping written by addClientToGroup
        // when moving a client between groups.
        UUID mappedGroupId = clientGroupMapping.get(clientId);
        if (groupId.equals(mappedGroupId)) {
            clientGroupMapping.remove(clientId);
        }
        
        logger.atFine().log("Removed client " + clientId + " from group " + groupId);
    }

    /**
     * Remove a client from all groups
     */
    public void removeClientFromAllGroups(UUID clientId) {
        UUID groupId = clientGroupMapping.remove(clientId);
        if (groupId != null) {
            removeClientFromGroup(clientId, groupId);
        }
    }

    /**
     * Get all clients in a group
     */
    public List<WebRTCClient> getGroupClients(UUID groupId) {
        Set<WebRTCClient> members = groupMembers.get(groupId);
        return members != null ? new ArrayList<>(members) : new ArrayList<>();
    }

    /**
     * Get the group a client is in
     */
    public UUID getClientGroup(UUID clientId) {
        return clientGroupMapping.get(clientId);
    }

    /**
     * Check if client is in a group
     */
    public boolean isClientInGroup(UUID clientId, UUID groupId) {
        return groupId.equals(clientGroupMapping.get(clientId));
    }

    /**
     * Broadcast a signaling message to all clients in a group except the sender
     */
    public void broadcastToGroup(UUID groupId, SignalingMessage message, UUID senderClientId) {
        Set<WebRTCClient> members = groupMembers.get(groupId);
        if (members == null || members.isEmpty()) {
            return;
        }

        String json = message.toJson();
        for (WebRTCClient client : members) {
            // Don't send back to sender
            if (client.getClientId().equals(senderClientId)) {
                continue;
            }
            
            try {
                client.sendMessage(json);
            } catch (Exception e) {
                logger.atWarning().log("Failed to send message to client " + client.getClientId(), e);
            }
        }
    }

    /**
     * Broadcast a signaling message to all clients in a group (including sender)
     */
    public void broadcastToGroupAll(UUID groupId, SignalingMessage message) {
        Set<WebRTCClient> members = groupMembers.get(groupId);
        if (members == null || members.isEmpty()) {
            return;
        }

        String json = message.toJson();
        for (WebRTCClient client : members) {
            try {
                client.sendMessage(json);
            } catch (Exception e) {
                logger.atWarning().log("Failed to send message to client " + client.getClientId(), e);
            }
        }
    }

    /**
     * Send a message to a specific client
     */
    public void sendToClient(UUID clientId, SignalingMessage message) {
        for (Set<WebRTCClient> members : groupMembers.values()) {
            for (WebRTCClient client : members) {
                if (client.getClientId().equals(clientId)) {
                    try {
                        client.sendMessage(message.toJson());
                    } catch (Exception e) {
                        logger.atWarning().log("Failed to send message to client " + clientId, e);
                    }
                    return;
                }
            }
        }
    }

    /**
     * Get member list for a group as JSON array (for group_members_updated message)
     * @param groupId The group ID
     * @param allClients Map of all clients (unused but kept for API compatibility)
     * @param clientIdMapper Optional mapper to obfuscate client IDs (if null, uses raw UUIDs)
     */
    public JsonArray getGroupMembersJson(UUID groupId, Map<UUID, WebRTCClient> allClients, ClientIdMapper clientIdMapper) {
        JsonArray members = new JsonArray();
        List<WebRTCClient> groupClients = getGroupClients(groupId);
        
        for (WebRTCClient client : groupClients) {
            JsonObject memberObj = new JsonObject();
            String id = clientIdMapper != null 
                ? clientIdMapper.getObfuscatedId(client.getClientId())
                : client.getClientId().toString();
            memberObj.addProperty("id", id);
            memberObj.addProperty("username", client.getUsername());
            memberObj.addProperty("isSpeaking", client.isSpeaking());
            // Note: "isMuted" represents microphone mute status (not speaker/output mute)
            // Clients map this to "isMicMuted" to distinguish from local speaker mute
            memberObj.addProperty("isMuted", client.isMuted());
            memberObj.addProperty("volume", client.getVolume());
            memberObj.addProperty("isVoiceConnected", client.isConnected());
            members.add(memberObj);
        }
        
        return members;
    }
    
    /**
     * Get member list for a group as JSON array (for group_members_updated message)
     * @deprecated Use {@link #getGroupMembersJson(UUID, Map, ClientIdMapper)} instead
     */
    @Deprecated
    public JsonArray getGroupMembersJson(UUID groupId, Map<UUID, WebRTCClient> allClients) {
        return getGroupMembersJson(groupId, allClients, null);
    }

    /**
     * Clear all state (for shutdown)
     */
    public void clear() {
        groupMembers.clear();
        clientGroupMapping.clear();
    }

    /**
     * Get statistics about group state
     */
    public String getStatistics() {
        int totalGroups = groupMembers.size();
        long totalClients = groupMembers.values().stream()
                .mapToLong(Set::size)
                .sum();
        
        return String.format("WebRTC Groups: %d, Total Clients: %d", totalGroups, totalClients);
    }
}
