package com.hytale.voicechat.plugin.gui;

import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.protocol.FormattedMessage;
import com.hypixel.hytale.protocol.packets.interface_.CustomPageLifetime;
import com.hypixel.hytale.protocol.packets.interface_.CustomUIEventBindingType;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.entity.entities.Player;
import com.hypixel.hytale.server.core.entity.entities.player.pages.InteractiveCustomUIPage;
import com.hypixel.hytale.server.core.ui.builder.EventData;
import com.hypixel.hytale.server.core.ui.builder.UICommandBuilder;
import com.hypixel.hytale.server.core.ui.builder.UIEventBuilder;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.plugin.GroupManager;

import javax.annotation.Nonnull;
import java.awt.Color;

public class VoiceChatPage extends InteractiveCustomUIPage<VoiceChatPage.VoiceChatData> {

    private static final String PAGE_LAYOUT = "Pages/VoiceChatGUI.ui";
    private final GroupManager groupManager;
    private boolean isMuted = false;
    private int inputVolume = 100;
    private int outputVolume = 100;
    private String currentMode = "PTT"; // "PTT" or "VAD"

    public VoiceChatPage(@Nonnull PlayerRef playerRef, @Nonnull GroupManager groupManager) {
        super(playerRef, CustomPageLifetime.CanDismiss, VoiceChatData.CODEC);
        this.groupManager = groupManager;
    }

    @Override
    public void build(@Nonnull Ref<EntityStore> ref, @Nonnull UICommandBuilder commands, @Nonnull UIEventBuilder events, @Nonnull Store<EntityStore> store) {
        commands.append(PAGE_LAYOUT);

        // Update initial values
        updateConnectionStatus(commands, store, ref);
        updateVolumeDisplay(commands);
        updateModeDisplay(commands);
        updateGroupDisplay(commands);
        updateMuteButton(commands);

        // Bind events for all interactive elements
        events.addEventBinding(CustomUIEventBindingType.Activating, "#CloseButton",
                EventData.of("CloseClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#PTTButton",
                EventData.of("PTTClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#VADButton",
                EventData.of("VADClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#MuteButton",
                EventData.of("MuteClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#TestMicButton",
                EventData.of("TestMicClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#RefreshButton",
                EventData.of("RefreshClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#ManageGroupsButton",
                EventData.of("ManageGroupsClicked", "true"), false);
    }

    @Override
    public void handleDataEvent(@Nonnull Ref<EntityStore> ref, @Nonnull Store<EntityStore> store, @Nonnull VoiceChatData data) {
        Player player = store.getComponent(ref, Player.getComponentType());
        if (player == null) return;

        UICommandBuilder commandBuilder = new UICommandBuilder();

        // Handle close button
        if (data.closeClicked != null) {
            this.close();
            return;
        }

        // Handle PTT mode selection
        if (data.pttClicked != null) {
            currentMode = "PTT";
            player.sendMessage(Message.raw("Voice mode set to: ").color(Color.YELLOW)
                    .join(Message.raw("Push-to-Talk").color(Color.GREEN).bold(true)));
            updateModeDisplay(commandBuilder);
        }

        // Handle VAD mode selection
        if (data.vadClicked != null) {
            currentMode = "VAD";
            player.sendMessage(Message.raw("Voice mode set to: ").color(Color.YELLOW)
                    .join(Message.raw("Voice Activated").color(Color.GREEN).bold(true)));
            updateModeDisplay(commandBuilder);
        }

        // Handle mute toggle
        if (data.muteClicked != null) {
            isMuted = !isMuted;
            String status = isMuted ? "Muted" : "Unmuted";
            Color statusColor = isMuted ? Color.RED : Color.GREEN;
            
            player.sendMessage(Message.raw("Microphone: ").color(Color.YELLOW)
                    .join(Message.raw(status).color(statusColor).bold(true)));
            
            updateMuteButton(commandBuilder);
        }

        // Handle test microphone
        if (data.testMicClicked != null) {
            player.sendMessage(Message.raw("Testing microphone... Speak now!").color(Color.CYAN));
            // TODO: Implement actual microphone testing
        }

        // Handle refresh
        if (data.refreshClicked != null) {
            updateConnectionStatus(commandBuilder, store, ref);
            updateVolumeDisplay(commandBuilder);
            updateGroupDisplay(commandBuilder);
            player.sendMessage(Message.raw("Voice chat status refreshed").color(Color.GREEN));
        }

        // Handle manage groups
        if (data.manageGroupsClicked != null) {
            sendGroupManagementInfo(player);
        }

        // Send updates if any changes were made
        if (commandBuilder.hasCommands()) {
            this.sendUpdate(commandBuilder, false);
        }
    }

    private void updateConnectionStatus(UICommandBuilder commands, Store<EntityStore> store, Ref<EntityStore> ref) {
        // Check if player is authenticated and connected to voice server
        Player player = store.getComponent(ref, Player.getComponentType());
        if (player != null) {
            // TODO: Check actual voice server connection status
            boolean isConnected = true; // Placeholder
            
            if (isConnected) {
                commands.set("#ConnectionStatus.TextSpans", 
                        Message.raw("Connected").color(Color.GREEN).bold(true));
            } else {
                commands.set("#ConnectionStatus.TextSpans", 
                        Message.raw("Disconnected").color(Color.RED).bold(true));
            }
        }
    }

    private void updateVolumeDisplay(UICommandBuilder commands) {
        commands.set("#InputVolumeValue.TextSpans", 
                Message.raw(inputVolume + "%").color(Color.YELLOW));
        commands.set("#OutputVolumeValue.TextSpans", 
                Message.raw(outputVolume + "%").color(Color.YELLOW));
    }

    private void updateModeDisplay(UICommandBuilder commands) {
        // Highlight the active mode button
        if ("PTT".equals(currentMode)) {
            commands.set("#PTTButton.BackgroundStyle.BorderColor", "#00ff00");
            commands.set("#VADButton.BackgroundStyle.BorderColor", "#808080");
        } else {
            commands.set("#PTTButton.BackgroundStyle.BorderColor", "#808080");
            commands.set("#VADButton.BackgroundStyle.BorderColor", "#00ff00");
        }
    }

    private void updateGroupDisplay(UICommandBuilder commands) {
        PlayerRef playerRef = this.playerRef;
        String groupName = groupManager.getPlayerGroup(playerRef.getUuid());
        
        if (groupName != null) {
            commands.set("#CurrentGroupLabel.TextSpans", 
                    Message.raw("Current Group: ").color(Color.WHITE)
                            .join(Message.raw(groupName).color(Color.CYAN).bold(true)));
        } else {
            commands.set("#CurrentGroupLabel.TextSpans", 
                    Message.raw("Current Group: ").color(Color.WHITE)
                            .join(Message.raw("None (Proximity)").color(Color.GRAY)));
        }
    }

    private void updateMuteButton(UICommandBuilder commands) {
        if (isMuted) {
            commands.set("#MuteButtonLabel.TextSpans", 
                    Message.raw("Unmute").color(Color.GREEN).bold(true));
        } else {
            commands.set("#MuteButtonLabel.TextSpans", 
                    Message.raw("Mute").color(Color.RED).bold(true));
        }
    }

    private void sendGroupManagementInfo(Player player) {
        player.sendMessage(Message.raw("=== Voice Groups ===").color(Color.YELLOW).bold(true));
        player.sendMessage(Message.raw("Use these commands to manage groups:").color(Color.WHITE));
        player.sendMessage(Message.raw("  /voicegroup create <name>").color(Color.CYAN)
                .join(Message.raw(" - Create a new group").color(Color.GRAY)));
        player.sendMessage(Message.raw("  /voicegroup join <name>").color(Color.CYAN)
                .join(Message.raw(" - Join an existing group").color(Color.GRAY)));
        player.sendMessage(Message.raw("  /voicegroup leave").color(Color.CYAN)
                .join(Message.raw(" - Leave your current group").color(Color.GRAY)));
        player.sendMessage(Message.raw("  /voicegroup list").color(Color.CYAN)
                .join(Message.raw(" - List all groups").color(Color.GRAY)));
        player.sendMessage(Message.raw("  /voiceproximity <distance>").color(Color.CYAN)
                .join(Message.raw(" - Set proximity range").color(Color.GRAY)));
    }

    public static class VoiceChatData {
        static final String KEY_CLOSE = "CloseClicked";
        static final String KEY_PTT = "PTTClicked";
        static final String KEY_VAD = "VADClicked";
        static final String KEY_MUTE = "MuteClicked";
        static final String KEY_TEST_MIC = "TestMicClicked";
        static final String KEY_REFRESH = "RefreshClicked";
        static final String KEY_MANAGE_GROUPS = "ManageGroupsClicked";

        public static final BuilderCodec<VoiceChatData> CODEC = BuilderCodec.builder(VoiceChatData.class, VoiceChatData::new)
                .addField(new KeyedCodec<>(KEY_CLOSE, Codec.STRING), (d, v) -> d.closeClicked = v, d -> d.closeClicked)
                .addField(new KeyedCodec<>(KEY_PTT, Codec.STRING), (d, v) -> d.pttClicked = v, d -> d.pttClicked)
                .addField(new KeyedCodec<>(KEY_VAD, Codec.STRING), (d, v) -> d.vadClicked = v, d -> d.vadClicked)
                .addField(new KeyedCodec<>(KEY_MUTE, Codec.STRING), (d, v) -> d.muteClicked = v, d -> d.muteClicked)
                .addField(new KeyedCodec<>(KEY_TEST_MIC, Codec.STRING), (d, v) -> d.testMicClicked = v, d -> d.testMicClicked)
                .addField(new KeyedCodec<>(KEY_REFRESH, Codec.STRING), (d, v) -> d.refreshClicked = v, d -> d.refreshClicked)
                .addField(new KeyedCodec<>(KEY_MANAGE_GROUPS, Codec.STRING), (d, v) -> d.manageGroupsClicked = v, d -> d.manageGroupsClicked)
                .build();

        private String closeClicked;
        private String pttClicked;
        private String vadClicked;
        private String muteClicked;
        private String testMicClicked;
        private String refreshClicked;
        private String manageGroupsClicked;
    }
}
