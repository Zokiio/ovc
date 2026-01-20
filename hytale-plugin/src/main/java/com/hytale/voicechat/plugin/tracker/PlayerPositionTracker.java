package com.hytale.voicechat.plugin.tracker;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hypixel.hytale.logger.HytaleLogger;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks player positions for proximity-based voice routing
 */
public class PlayerPositionTracker {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final Map<UUID, PlayerPosition> playerPositions;
    private volatile boolean running;

    public PlayerPositionTracker() {
        this.playerPositions = new ConcurrentHashMap<>();
        this.running = false;
    }

    public void start() {
        if (running) {
            logger.atWarning().log("Position tracker already running");
            return;
        }

        running = true;
        logger.atInfo().log("Position tracker started");
    }

    public void stop() {
        if (!running) {
            return;
        }

        running = false;
        logger.atInfo().log("Player position tracker stopped");
    }

    /**
     * Update a player's position
     */
    public void updatePosition(UUID playerId, String playerName, double x, double y, double z, double yaw, double pitch, String worldId) {
        PlayerPosition position = new PlayerPosition(playerId, playerName, x, y, z, yaw, pitch, worldId);
        playerPositions.put(playerId, position);
    }

    /**
     * Remove a player from tracking
     */
    public void removePlayer(UUID playerId) {
        playerPositions.remove(playerId);
    }

    /**
     * Add a new player to tracking
     */
    public void addPlayer(PlayerPosition position) {
        playerPositions.put(position.getPlayerId(), position);
    }

    /**
     * Get all player positions
     */
    public Map<UUID, PlayerPosition> getPlayerPositions() {
        return Collections.unmodifiableMap(playerPositions);
    }
    
    /**
     * Get a specific player's position
     */
    public PlayerPosition getPlayerPosition(UUID playerId) {
        return playerPositions.get(playerId);
    }
    
    /**
     * Get player UUID by username (case-insensitive)
     */
    public UUID getPlayerUUIDByUsername(String username) {
        if (username == null) {
            return null;
        }
        
        for (PlayerPosition position : playerPositions.values()) {
            if (username.equalsIgnoreCase(position.getPlayerName())) {
                return position.getPlayerId();
            }
        }
        
        return null;
    }
}
