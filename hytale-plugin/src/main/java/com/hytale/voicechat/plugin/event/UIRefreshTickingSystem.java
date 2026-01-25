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
 * Runs on a throttled interval (every 10 ticks = ~500ms) to balance responsiveness
 * with performance.
 */
public class UIRefreshTickingSystem extends TickingSystem<EntityStore> {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final int REFRESH_INTERVAL_TICKS = 10; // Refresh every ~500ms (tick = 50ms)

    private int tickCounter = 0;

    public UIRefreshTickingSystem() {
    }

    @Override
    public void tick(float deltaSeconds, int tickCount, @Nonnull Store<EntityStore> store) {
        tickCounter++;
        
        // Only refresh on the specified interval
        if (tickCounter >= REFRESH_INTERVAL_TICKS) {
            tickCounter = 0;
            
            try {
                // Trigger refresh on all open VoiceChatPage instances
                VoiceChatPage.refreshAllPages(store);
            } catch (Exception e) {
                logger.atWarning().log("Error refreshing UI pages: " + e.getMessage());
            }
        }
    }
}
