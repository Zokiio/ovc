package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.query.Query;
import com.hypixel.hytale.component.system.QuerySystem;
import com.hypixel.hytale.component.system.tick.TickingSystem;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.modules.entity.component.TransformComponent;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;

import javax.annotation.Nonnull;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Samples player movement and updates the position tracker with a small throttle
 * to keep positional audio accurate without spamming updates.
 */
public class PlayerMoveEventSystem extends TickingSystem<EntityStore> implements QuerySystem<EntityStore> {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final double MIN_DISTANCE_DELTA = 0.5; // blocks
    private static final long MIN_INTERVAL_MS = 100; // throttle per player

    private final PlayerPositionTracker positionTracker;
    private final Map<UUID, Sample> lastSamples = new ConcurrentHashMap<>();

    public PlayerMoveEventSystem(PlayerPositionTracker positionTracker) {
        this.positionTracker = positionTracker;
    }

    @Override
    public void tick(float deltaSeconds, int tickCount, @Nonnull Store<EntityStore> store) {
        var seen = ConcurrentHashMap.newKeySet();

        store.forEachChunk(getQuery(), (chunk, commandBuffer) -> {
            int size = chunk.size();
            for (int i = 0; i < size; i++) {
                PlayerRef playerRef = chunk.getComponent(i, PlayerRef.getComponentType());
                TransformComponent transform = chunk.getComponent(i, TransformComponent.getComponentType());
                if (playerRef == null || transform == null || transform.getPosition() == null) {
                    continue;
                }
                sampleAndUpdate(playerRef, transform);
                seen.add(playerRef.getUuid());
            }
        });

        // Cleanup entries for players no longer present
        lastSamples.keySet().removeIf(uuid -> !seen.contains(uuid));
    }

    private void sampleAndUpdate(@Nonnull PlayerRef playerRef, @Nonnull TransformComponent transform) {
        var pos = transform.getPosition();
        UUID playerUUID = playerRef.getUuid();
        String username = playerRef.getUsername();
        double x = pos.getX();
        double y = pos.getY();
        double z = pos.getZ();
        double yaw = 0.0;
        double pitch = 0.0;
        if (transform.getRotation() != null) {
            try {
                yaw = transform.getRotation().getYaw();
                pitch = transform.getRotation().getPitch();
            } catch (Exception ignored) {
                // fallback to zero if API differs
            }
        }
        String worldId = "world"; // TODO: replace when world identifier is available from TransformComponent

        long now = System.currentTimeMillis();
        Sample prev = lastSamples.get(playerUUID);

        if (prev != null) {
            double dx = prev.x - x;
            double dy = prev.y - y;
            double dz = prev.z - z;
            double dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            long dt = now - prev.timestamp;

            if (dist < MIN_DISTANCE_DELTA && dt < MIN_INTERVAL_MS) {
                return; // small move within throttle window
            }
        }

        lastSamples.put(playerUUID, new Sample(x, y, z, now, worldId));
        positionTracker.updatePosition(playerUUID, username, x, y, z, yaw, pitch, worldId);
        logger.atFine().log("Movement update for " + username + " @ (" + x + ", " + y + ", " + z + ")");
    }

    @Override
    public Query<EntityStore> getQuery() {
        return PlayerRef.getComponentType();
    }

    private static final class Sample {
        final double x;
        final double y;
        final double z;
        final long timestamp;
        final String worldId;

        Sample(double x, double y, double z, long timestamp, String worldId) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.timestamp = timestamp;
            this.worldId = worldId;
        }
    }
}
