package com.zottik.ovc.plugin.event;

import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.component.system.tick.TickingSystem;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.zottik.ovc.plugin.gui.VoiceChatPage;

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

    private int localTickCounter = 0; // local counter to avoid relying on external tickCount semantics

    public UIRefreshTickingSystem() {
    }

    @Override
    public void tick(float deltaSeconds, int tickCount, @Nonnull Store<EntityStore> store) {
        // Use a local counter in case tickCount semantics differ across environments
        localTickCounter++;

        if (localTickCounter >= REFRESH_INTERVAL_TICKS) {
            localTickCounter = 0;
            try {
                // Trigger refresh on all open VoiceChatPage instances
                VoiceChatPage.refreshAllPages(store);
            } catch (Exception e) {
                logger.atWarning().log("Error refreshing UI pages: " + e.getMessage());
            }
        }
    }
}
