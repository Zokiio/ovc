package com.hytale.voicechat.plugin.tracker;

import com.hytale.voicechat.common.model.PlayerPosition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tracks player positions for proximity-based voice routing
 */
public class PlayerPositionTracker {
    private static final Logger logger = LoggerFactory.getLogger(PlayerPositionTracker.class);
    
    private final Map<UUID, PlayerPosition> playerPositions;
    private volatile boolean running;

    public PlayerPositionTracker() {
        this.playerPositions = new ConcurrentHashMap<>();
        this.running = false;
    }

    public void start() {
        if (running) {
            logger.warn("Position tracker already running");
            return;
        }

        running = true;
        logger.info("Player position tracker started");
    }

    public void stop() {
        if (!running) {
            return;
        }

        running = false;
        logger.info("Player position tracker stopped");
    }

    /**
     * Update a player's position
     */
    public void updatePosition(UUID playerId, String playerName, double x, double y, double z, String worldId) {
        PlayerPosition position = new PlayerPosition(playerId, playerName, x, y, z, worldId);
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
}
