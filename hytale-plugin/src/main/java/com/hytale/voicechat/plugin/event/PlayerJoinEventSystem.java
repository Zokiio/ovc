package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.AddReason;
import com.hypixel.hytale.component.Holder;
import com.hypixel.hytale.component.RemoveReason;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.query.Query;
import com.hypixel.hytale.component.system.HolderSystem;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.modules.entity.component.TransformComponent;
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
            if (transform != null) {
                var pos = transform.getPosition();
                // World ID will be tracked separately
                String worldId = "world"; // Default for now
                
                logger.atInfo().log("Player joined: " + username + " (UUID: " + playerUUID + ")");
                positionTracker.updatePosition(playerUUID, username, pos.getX(), pos.getY(), pos.getZ(), worldId);
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
}
