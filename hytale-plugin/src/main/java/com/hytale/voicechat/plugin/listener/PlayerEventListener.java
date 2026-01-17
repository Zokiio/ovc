package com.hytale.voicechat.plugin.listener;

import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Listens to Hytale player events and updates position tracker
 * 
 * TODO: Integrate with actual Hytale API events:
 * - PlayerJoinEvent
 * - PlayerQuitEvent  
 * - PlayerMoveEvent
 * - PlayerTeleportEvent
 */
public class PlayerEventListener {
    private static final Logger logger = LoggerFactory.getLogger(PlayerEventListener.class);
    
    private final PlayerPositionTracker positionTracker;
    private final Map<String, UUID> usernameToPlayerUUID; // username -> Hytale player UUID
    
    public PlayerEventListener(PlayerPositionTracker positionTracker) {
        this.positionTracker = positionTracker;
        this.usernameToPlayerUUID = new ConcurrentHashMap<>();
    }
    
    /**
     * Called when a player joins the server
     * TODO: Hook to Hytale PlayerJoinEvent
     */
    public void onPlayerJoin(UUID playerUUID, String username, double x, double y, double z, String worldId) {
        logger.info("Player joined: {} (UUID: {})", username, playerUUID);
        
        // Map username to Hytale player UUID
        usernameToPlayerUUID.put(username, playerUUID);
        
        // Add player to position tracker
        positionTracker.updatePosition(playerUUID, username, x, y, z, worldId);
    }
    
    /**
     * Called when a player quits the server
     * TODO: Hook to Hytale PlayerQuitEvent
     */
    public void onPlayerQuit(UUID playerUUID, String username) {
        logger.info("Player quit: {} (UUID: {})", username, playerUUID);
        
        // Remove from tracking
        usernameToPlayerUUID.remove(username);
        positionTracker.removePlayer(playerUUID);
    }
    
    /**
     * Called when a player moves
     * TODO: Hook to Hytale PlayerMoveEvent
     * 
     * Note: This should be throttled or only fire on significant movement
     * to avoid excessive updates (e.g., every 100ms or 1 block movement)
     */
    public void onPlayerMove(UUID playerUUID, String username, double x, double y, double z, String worldId) {
        positionTracker.updatePosition(playerUUID, username, x, y, z, worldId);
    }
    
    /**
     * Called when a player teleports
     * TODO: Hook to Hytale PlayerTeleportEvent
     */
    public void onPlayerTeleport(UUID playerUUID, String username, double x, double y, double z, String worldId) {
        logger.debug("Player teleported: {} to ({}, {}, {}) in {}", username, x, y, z, worldId);
        positionTracker.updatePosition(playerUUID, username, x, y, z, worldId);
    }
    
    /**
     * Get Hytale player UUID from username
     */
    public UUID getPlayerUUID(String username) {
        return usernameToPlayerUUID.get(username);
    }
    
    /**
     * Get all tracked players
     */
    public Map<String, UUID> getTrackedPlayers() {
        return usernameToPlayerUUID;
    }
}
