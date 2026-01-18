package com.hytale.voicechat.common.model;

import java.util.UUID;

/**
 * Represents a player in the voice chat system
 */
public class PlayerPosition {
    private final UUID playerId;
    private final String playerName;
    private final double x;
    private final double y;
    private final double z;
    private final double yaw;
    private final double pitch;
    private final String worldId;
    private final long timestamp;

    public PlayerPosition(UUID playerId, String playerName, double x, double y, double z, double yaw, double pitch, String worldId) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.x = x;
        this.y = y;
        this.z = z;
        this.yaw = yaw;
        this.pitch = pitch;
        this.worldId = worldId;
        this.timestamp = System.currentTimeMillis();
    }

    public UUID getPlayerId() {
        return playerId;
    }

    public String getPlayerName() {
        return playerName;
    }

    public double getX() {
        return x;
    }

    public double getY() {
        return y;
    }

    public double getZ() {
        return z;
    }

    public double getYaw() {
        return yaw;
    }

    public double getPitch() {
        return pitch;
    }

    public String getWorldId() {
        return worldId;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public double distanceTo(PlayerPosition other) {
        if (!this.worldId.equals(other.worldId)) {
            return Double.MAX_VALUE;
        }
        double dx = this.x - other.x;
        double dy = this.y - other.y;
        double dz = this.z - other.z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
}
