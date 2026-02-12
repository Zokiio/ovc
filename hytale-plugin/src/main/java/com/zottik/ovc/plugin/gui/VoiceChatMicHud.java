package com.zottik.ovc.plugin.gui;

import com.hypixel.hytale.server.core.entity.entities.player.hud.CustomUIHud;
import com.hypixel.hytale.server.core.ui.builder.UICommandBuilder;
import com.hypixel.hytale.server.core.universe.PlayerRef;

/**
 * Lightweight HUD element that shows web client mic status.
 */
public class VoiceChatMicHud extends CustomUIHud {
    private static final String HUD_LAYOUT = "VoiceChatMicHud.ui";

    private boolean visible = false;
    private boolean muted = false;

    public VoiceChatMicHud(PlayerRef playerRef) {
        super(playerRef);
    }

    @Override
    protected void build(UICommandBuilder builder) {
        builder.append(HUD_LAYOUT);
        builder.set("#MicHudRoot.Visible", false);
        builder.set("#MicActive.Visible", false);
        builder.set("#MicMuted.Visible", false);
    }

    public void updateState(boolean connected, boolean isMuted, boolean showHud) {
        boolean nextVisible = showHud && connected;
        boolean nextMuted = isMuted;

        if (nextVisible == this.visible && nextMuted == this.muted) {
            return;
        }

        this.visible = nextVisible;
        this.muted = nextMuted;

        UICommandBuilder builder = new UICommandBuilder();
        builder.set("#MicHudRoot.Visible", nextVisible);
        builder.set("#MicActive.Visible", nextVisible && !nextMuted);
        builder.set("#MicMuted.Visible", nextVisible && nextMuted);
        update(false, builder);
    }
}
