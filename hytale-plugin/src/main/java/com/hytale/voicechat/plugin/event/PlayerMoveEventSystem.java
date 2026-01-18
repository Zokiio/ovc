package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.Holder;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.system.HolderSystem;
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
public class PlayerMoveEventSystem extends HolderSystem<EntityStore> {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final double MIN_DISTANCE_DELTA = 0.5; // blocks
    private static final long MIN_INTERVAL_MS = 100; // throttle per player

    private final PlayerPositionTracker positionTracker;
    private final Map<UUID, Sample> lastSamples = new ConcurrentHashMap<>();

    public PlayerMoveEventSystem(PlayerPositionTracker positionTracker) {
        this.positionTracker = positionTracker;
    }

    @Override
    public void onEntityAdd(@Nonnull Holder<EntityStore> holder,
                            @Nonnull com.hypixel.hytale.component.AddReason reason,
                            @Nonnull Store<EntityStore> store) {
        sampleAndUpdate(holder, true);
    }

    @Override
    public void onEntityRemoved(@Nonnull Holder<EntityStore> holder,
                                @Nonnull com.hypixel.hytale.component.RemoveReason reason,
                                @Nonnull Store<EntityStore> store) {
        PlayerRef playerRef = holder.getComponent(PlayerRef.getComponentType());
        if (playerRef != null) {
            lastSamples.remove(playerRef.getUuid());
        }
    }

    /**
     * Tick hook (name chosen to match HolderSystem patterns); if the engine exposes
     * a different per-tick callback, wire this logic there.
     */
    public void onEntityTick(@Nonnull Holder<EntityStore> holder,
                             @Nonnull Store<EntityStore> store) {
        sampleAndUpdate(holder, false);
    }

    private void sampleAndUpdate(@Nonnull Holder<EntityStore> holder, boolean force) {
        PlayerRef playerRef = holder.getComponent(PlayerRef.getComponentType());
        if (playerRef == null) {
            return;
        }

        TransformComponent transform = holder.getComponent(TransformComponent.getComponentType());
        if (transform == null || transform.getPosition() == null) {
            return;
        }

        var pos = transform.getPosition();
        UUID playerUUID = playerRef.getUuid();
        String username = playerRef.getUsername();
        double x = pos.getX();
        double y = pos.getY();
        double z = pos.getZ();
        String worldId = "world"; // TODO: replace when world identifier is available from TransformComponent

        long now = System.currentTimeMillis();
        Sample prev = lastSamples.get(playerUUID);

        if (!force && prev != null) {
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
        positionTracker.updatePosition(playerUUID, username, x, y, z, worldId);
        logger.atFine().log("Movement update for " + username + " @ (" + x + ", " + y + ", " + z + ")");
    }

    @Override
    public com.hypixel.hytale.component.query.Query<EntityStore> getQuery() {
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
