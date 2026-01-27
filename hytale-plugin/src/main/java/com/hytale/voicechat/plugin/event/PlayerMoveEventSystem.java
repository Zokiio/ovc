package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.ArchetypeChunk;
import com.hypixel.hytale.component.CommandBuffer;
import com.hypixel.hytale.component.query.Query;
import com.hypixel.hytale.component.system.QuerySystem;
import com.hypixel.hytale.component.system.tick.TickingSystem;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.modules.entity.component.TransformComponent;
import com.hypixel.hytale.server.core.modules.entity.component.HeadRotation;
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

        store.forEachChunk(getQuery(), (java.util.function.BiConsumer<ArchetypeChunk<EntityStore>, CommandBuffer<EntityStore>>) (chunk, commandBuffer) -> {
            int size = chunk.size();
            for (int i = 0; i < size; i++) {
                PlayerRef playerRef = chunk.getComponent(i, PlayerRef.getComponentType());
                TransformComponent transform = chunk.getComponent(i, TransformComponent.getComponentType());
                HeadRotation headRotation = chunk.getComponent(i, HeadRotation.getComponentType());
                if (playerRef == null || transform == null || transform.getPosition() == null) {
                    continue;
                }
                sampleAndUpdate(playerRef, transform, headRotation);
                seen.add(playerRef.getUuid());
            }
        });

        // Cleanup entries for players no longer present
        lastSamples.keySet().removeIf(uuid -> !seen.contains(uuid));
    }

    private void sampleAndUpdate(@Nonnull PlayerRef playerRef, @Nonnull TransformComponent transform, HeadRotation headRotation) {
        var pos = transform.getPosition();
        UUID playerUUID = playerRef.getUuid();
        String username = playerRef.getUsername();
        double x = pos.getX();
        double y = pos.getY();
        double z = pos.getZ();
        double yaw = 0.0;
        double pitch = 0.0;

        // Prefer independent head rotation if available
        if (headRotation != null && headRotation.getRotation() != null) {
            var hrot = headRotation.getRotation();
            Double hx = null, hy = null, hz = null;
            try { hx = (double) hrot.getX(); } catch (Exception ignored) {}
            try { hy = (double) hrot.getY(); } catch (Exception ignored) {}
            try { hz = (double) hrot.getZ(); } catch (Exception ignored) {}

            yaw = chooseDegrees(hy, hz, null);   // likely Y is yaw
            pitch = chooseDegrees(hx, null, null); // likely X is pitch
        } else if (transform.getRotation() != null) {
            var rot = transform.getRotation();
            Double yawRaw = null;
            Double pitchRaw = null;
            Double altX = null;
            Double altY = null;
            Double altZ = null;

            try { yawRaw = (double) rot.getYaw(); } catch (Exception ignored) {}
            try { pitchRaw = (double) rot.getPitch(); } catch (Exception ignored) {}
            try { altX = (double) rot.getX(); } catch (Exception ignored) {}
            try { altY = (double) rot.getY(); } catch (Exception ignored) {}
            try { altZ = (double) rot.getZ(); } catch (Exception ignored) {}

            yaw = chooseDegrees(yawRaw, altY, altZ);
            pitch = chooseDegrees(pitchRaw, altX, null);

            logger.atInfo().log("[ROT_CAPTURE] player=" + username
                    + " yawRaw=" + safeD(yawRaw)
                    + " pitchRaw=" + safeD(pitchRaw)
                    + " altX=" + safeD(altX)
                    + " altY=" + safeD(altY)
                    + " altZ=" + safeD(altZ)
                    + " yawDeg=" + String.format("%.2f", yaw)
                    + " pitchDeg=" + String.format("%.2f", pitch)
                    + " rotClass=" + rot.getClass().getSimpleName()
                    + " rot=" + rot.toString());
        } else {
            logger.atWarning().log("TransformComponent.getRotation() is NULL for player " + username);
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

        lastSamples.put(playerUUID, new Sample(x, y, z, now));
        positionTracker.updatePosition(playerUUID, username, x, y, z, yaw, pitch, worldId);
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

        Sample(double x, double y, double z, long timestamp) {
            this.x = x;
            this.y = y;
            this.z = z;
            this.timestamp = timestamp;
        }
    }

    private static double chooseDegrees(Double primary, Double fallback1, Double fallback2) {
        Double candidate = firstFinite(primary, fallback1, fallback2);
        if (candidate == null) {
            return 0.0;
        }
        double val = candidate;
        // Heuristic: if absolute value is larger than 2π, assume already degrees; otherwise radians.
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

    private static String safeD(Double v) {
        return (v == null || v.isNaN() || v.isInfinite()) ? "null" : String.format("%.4f", v);
    }
}
