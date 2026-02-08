package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.ArchetypeChunk;
import com.hypixel.hytale.component.CommandBuffer;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.query.Query;
import com.hypixel.hytale.component.system.QuerySystem;
import com.hypixel.hytale.component.system.tick.TickingSystem;
import com.hypixel.hytale.server.core.entity.entities.Player;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.plugin.HytaleVoiceChatPlugin;
import com.hytale.voicechat.plugin.gui.VoiceChatMicHud;

import javax.annotation.Nonnull;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Periodically updates the mic HUD for all players.
 */
public class VoiceChatHudTickingSystem extends TickingSystem<EntityStore> implements QuerySystem<EntityStore> {
    private static final int REFRESH_INTERVAL_TICKS = 10; // ~500ms at 20 TPS

    private final HytaleVoiceChatPlugin plugin;
    private final Map<UUID, VoiceChatMicHud> huds = new ConcurrentHashMap<>();
    private int localTickCounter = 0;

    public VoiceChatHudTickingSystem(HytaleVoiceChatPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public void tick(float deltaSeconds, int tickCount, @Nonnull Store<EntityStore> store) {
        localTickCounter++;
        if (localTickCounter < REFRESH_INTERVAL_TICKS) {
            return;
        }
        localTickCounter = 0;

        var seen = ConcurrentHashMap.newKeySet();

        store.forEachChunk(getQuery(), (java.util.function.BiConsumer<ArchetypeChunk<EntityStore>, CommandBuffer<EntityStore>>) (chunk, commandBuffer) -> {
            int size = chunk.size();
            for (int i = 0; i < size; i++) {
                PlayerRef playerRef = chunk.getComponent(i, PlayerRef.getComponentType());
                Player player = chunk.getComponent(i, Player.getComponentType());
                if (playerRef == null || player == null) {
                    continue;
                }

                UUID playerId = playerRef.getUuid();
                seen.add(playerId);

                boolean hidden = plugin.isHudHidden(playerId);
                boolean connected = plugin.getWebRTCServer() != null
                    && plugin.getWebRTCServer().isWebClientConnected(playerId);
                boolean muted = connected
                    && plugin.getWebRTCServer().isWebClientMuted(playerId);

                VoiceChatMicHud hud = huds.get(playerId);

                if (hud == null) {
                    if (connected && !hidden) {
                        hud = new VoiceChatMicHud(playerRef);
                        huds.put(playerId, hud);
                        player.getHudManager().setCustomHud(playerRef, hud);
                        hud.updateState(true, muted, true);
                    }
                    continue;
                }

                if (connected && !hidden) {
                    hud.updateState(true, muted, true);
                } else {
                    hud.updateState(false, muted, false);
                }
            }
        });

        huds.keySet().removeIf(uuid -> !seen.contains(uuid));
    }

    @Override
    public Query<EntityStore> getQuery() {
        return PlayerRef.getComponentType();
    }
}
