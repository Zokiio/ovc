package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.AddReason;
import com.hypixel.hytale.component.Holder;
import com.hypixel.hytale.component.RemoveReason;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.query.Query;
import com.hypixel.hytale.component.system.HolderSystem;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.modules.entity.component.TransformComponent;
import com.hypixel.hytale.server.core.modules.entity.component.HeadRotation;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;

import javax.annotation.Nonnull;

/**
 * System that tracks when players join and leave the server
 */
public class PlayerJoinEventSystem extends HolderSystem<EntityStore> {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final PlayerPositionTracker positionTracker;

    public PlayerJoinEventSystem(PlayerPositionTracker positionTracker) {
        this.positionTracker = positionTracker;
    }

    @Override
    public void onEntityAdd(@Nonnull Holder<EntityStore> holder,
                            @Nonnull AddReason reason,
                            @Nonnull Store<EntityStore> store) {
        PlayerRef playerRef = holder.getComponent(PlayerRef.getComponentType());
        if (playerRef != null) {
            String username = playerRef.getUsername();
            var playerUUID = playerRef.getUuid();
            
            // Get player position from TransformComponent
            TransformComponent transform = holder.getComponent(TransformComponent.getComponentType());
            HeadRotation headRotation = holder.getComponent(HeadRotation.getComponentType());
            if (transform != null) {
                var pos = transform.getPosition();
                // World ID will be tracked separately
                String worldId = "world"; // Default for now
                
                double yaw = 0.0;
                double pitch = 0.0;
                if (headRotation != null && headRotation.getRotation() != null) {
                    var hrot = headRotation.getRotation();
                    Double hx = null, hy = null, hz = null;
                    try { hx = (double) hrot.getX(); } catch (Exception ignored) {}
                    try { hy = (double) hrot.getY(); } catch (Exception ignored) {}
                    try { hz = (double) hrot.getZ(); } catch (Exception ignored) {}
                    yaw = chooseDegrees(hy, hz, null);
                    pitch = chooseDegrees(hx, null, null);
                    logger.atInfo().log("[HEAD_ROT_CAPTURE] join player=" + username + " hx=" + hx + " hy=" + hy + " hz=" + hz + " yawDeg=" + yaw + " pitchDeg=" + pitch);
                } else if (transform.getRotation() != null) {
                    try {
                        yaw = transform.getRotation().getYaw();
                        pitch = transform.getRotation().getPitch();
                    } catch (Exception ignored) {
                    }
                }

                logger.atInfo().log("Player joined: " + username + " (UUID: " + playerUUID + ")");
                positionTracker.updatePosition(playerUUID, username, pos.getX(), pos.getY(), pos.getZ(), yaw, pitch, worldId);
            }
        }
    }

    @Override
    public void onEntityRemoved(@Nonnull Holder<EntityStore> holder,
                                @Nonnull RemoveReason reason,
                                @Nonnull Store<EntityStore> store) {
        PlayerRef playerRef = holder.getComponent(PlayerRef.getComponentType());
        if (playerRef != null) {
            String username = playerRef.getUsername();
            var playerUUID = playerRef.getUuid();
            
            logger.atInfo().log("Player quit: " + username + " (UUID: " + playerUUID + ")");
            positionTracker.removePlayer(playerUUID);
        }
    }

    @Override
    public Query<EntityStore> getQuery() {
        return PlayerRef.getComponentType();
    }

    private static double chooseDegrees(Double primary, Double fallback1, Double fallback2) {
        Double candidate = firstFinite(primary, fallback1, fallback2);
        if (candidate == null) {
            return 0.0;
        }
        double val = candidate;
        if (Math.abs(val) <= (Math.PI * 2.0)) {
            val = Math.toDegrees(val);
        }
        return val;
    }

    private static Double firstFinite(Double... values) {
        if (values == null) return null;
        for (Double v : values) {
            if (v != null && !v.isNaN() && !v.isInfinite()) {
                return v;
            }
        }
        return null;
    }
}
