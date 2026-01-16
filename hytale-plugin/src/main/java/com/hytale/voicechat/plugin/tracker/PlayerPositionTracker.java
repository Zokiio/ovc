package com.hytale.voicechat.plugin.tracker;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.plugin.api.VoiceServerAPIClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Tracks player positions and sends updates to the voice server
 */
public class PlayerPositionTracker {
    private static final Logger logger = LoggerFactory.getLogger(PlayerPositionTracker.class);
    private static final long UPDATE_INTERVAL_MS = 50; // 20 updates per second
    
    private final Map<UUID, PlayerPosition> playerPositions;
    private final VoiceServerAPIClient apiClient;
    private final ScheduledExecutorService scheduler;
    private volatile boolean running;

    public PlayerPositionTracker(VoiceServerAPIClient apiClient) {
        this.apiClient = apiClient;
        this.playerPositions = new ConcurrentHashMap<>();
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread thread = new Thread(r, "Position-Tracker");
            thread.setDaemon(true);
            return thread;
        });
        this.running = false;
    }

    public void start() {
        if (running) {
            logger.warn("Position tracker already running");
            return;
        }

        running = true;
        scheduler.scheduleAtFixedRate(
                this::sendPositionUpdates,
                0,
                UPDATE_INTERVAL_MS,
                TimeUnit.MILLISECONDS
        );
        
        logger.info("Player position tracker started");
    }

    public void stop() {
        if (!running) {
            return;
        }

        running = false;
        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(5, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }
        
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
        apiClient.playerLeft(playerId.toString());
    }

    /**
     * Add a new player to tracking
     */
    public void addPlayer(PlayerPosition position) {
        playerPositions.put(position.getPlayerId(), position);
        apiClient.playerJoined(position);
    }

    private void sendPositionUpdates() {
        if (playerPositions.isEmpty()) {
            return;
        }

        try {
            List<PlayerPosition> positions = new ArrayList<>(playerPositions.values());
            apiClient.updatePlayerPositions(positions);
        } catch (Exception e) {
            logger.error("Error sending position updates", e);
        }
    }

    public Map<UUID, PlayerPosition> getPlayerPositions() {
        return Collections.unmodifiableMap(playerPositions);
    }
}
