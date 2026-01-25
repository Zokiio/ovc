package com.hytale.voicechat.plugin.event;

import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.system.tick.TickingSystem;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.plugin.gui.VoiceChatPage;

import javax.annotation.Nonnull;

/**
 * Periodically refreshes open VoiceChatPage UIs to reflect current group state changes
 * without requiring user interaction. Updates connection status, group lists, and member
 * counts automatically.
 * 
 * Runs on a throttled interval (every {@value #REFRESH_INTERVAL_TICKS} ticks) to balance
 * responsiveness with performance. Assuming a 20 TPS server tick rate (~50ms per tick),
 * this corresponds to approximately 500ms between refreshes. The actual wall-clock
 * interval depends on the server's effective tick rate.
 */
public class UIRefreshTickingSystem extends TickingSystem<EntityStore> {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final int REFRESH_INTERVAL_TICKS = 10; // Refresh every 10 ticks (~500ms if tick ≈ 50ms)

    public UIRefreshTickingSystem() {
    }

    @Override
    public void tick(float deltaSeconds, int tickCount, @Nonnull Store<EntityStore> store) {
        // Only refresh on the specified interval using the provided tickCount to avoid overflow
        if (tickCount % REFRESH_INTERVAL_TICKS == 0) {
            try {
                // Trigger refresh on all open VoiceChatPage instances
                VoiceChatPage.refreshAllPages(store);
            } catch (Exception e) {
                logger.atWarning().log("Error refreshing UI pages: " + e.getMessage());
            }
        }
    }
}
