package com.hytale.voicechat.plugin.gui;

import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.entity.entities.player.pages.InteractiveCustomUIPage;
import com.hypixel.hytale.server.core.ui.builder.EventData;
import com.hypixel.hytale.server.core.ui.builder.UICommandBuilder;
import com.hypixel.hytale.server.core.ui.builder.UIEventBuilder;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hypixel.hytale.protocol.packets.interface_.CustomPageLifetime;
import com.hypixel.hytale.protocol.packets.interface_.CustomUIEventBindingType;
import com.hytale.voicechat.common.model.Group;
import com.hytale.voicechat.plugin.GroupManager;

import javax.annotation.Nonnull;
import java.util.List;
import java.util.UUID;

/**
 * Interactive GUI page for voice group management.
 */
public class VoiceGroupMenuPage extends InteractiveCustomUIPage<VoiceGroupMenuPage.VoiceGroupEventData> {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final String PAGE_LAYOUT = "VoiceGroupMenu.ui";
    private final GroupManager groupManager;

    public VoiceGroupMenuPage(@Nonnull PlayerRef playerRef, @Nonnull GroupManager groupManager) {
        super(playerRef, CustomPageLifetime.CanDismiss, VoiceGroupEventData.CODEC);
        this.groupManager = groupManager;
    }

    @Override
    public void build(@Nonnull Ref<EntityStore> ref, @Nonnull UICommandBuilder commands,
                      @Nonnull UIEventBuilder events, @Nonnull Store<EntityStore> store) {
        UUID playerId = playerRef.getUuid();
        Group currentGroup = groupManager.getPlayerGroup(playerId);
        List<Group> groups = groupManager.listGroups();

        // Load custom UI page from asset pack
        commands.append(PAGE_LAYOUT);

        // Bind static buttons
        events.addEventBinding(CustomUIEventBindingType.Activating, "#CloseButton",
            EventData.of("Action", "close"));
        events.addEventBinding(CustomUIEventBindingType.Activating, "#CreateButton",
            EventData.of("Action", "create"));
        events.addEventBinding(CustomUIEventBindingType.Activating, "#LeaveButton",
            EventData.of("Action", "leave"));

        // Current group label + leave visibility
        if (currentGroup != null) {
            commands.set("#CurrentLabel.Text", "Current: " + currentGroup.getName() + " (" + currentGroup.getMemberCount() + ")");
            commands.set("#LeaveButton.Visible", true);
        } else {
            commands.set("#CurrentLabel.Text", "You are not in a group");
            commands.set("#LeaveButton.Visible", false);
        }

        // Available groups count
        commands.set("#AvailLabel.Text", "Available: " + groups.size());

        // Populate group list with join buttons or show 'None'
        commands.clear("#GroupsList");
        boolean any = false;
        for (int i = 0; i < groups.size(); i++) {
            Group g = groups.get(i);
            String itemId = "#GroupItem" + i;
            String joinId = "#JoinButton" + i;

            commands.append("#GroupsList", "GroupItem.ui");
            commands.set(itemId + ".Visible", true);
            commands.set(itemId + ".Name.Text", g.getName());
            commands.set(itemId + ".Members.Text", "Members: " + g.getMemberCount());
            events.addEventBinding(CustomUIEventBindingType.Activating, joinId,
                EventData.of("Action", "join:" + g.getName()));
            any = true;
        }
        commands.set("#NoGroupsLabel.Visible", !any);
    }

    @Override
    public void handleDataEvent(@Nonnull Ref<EntityStore> ref, @Nonnull Store<EntityStore> store,
                                @Nonnull VoiceGroupEventData data) {
        UUID playerId = playerRef.getUuid();
        String action = data.action != null ? data.action : "";
        if (action.startsWith("join:")) {
            String groupName = action.substring("join:".length());
            Group group = groupManager.listGroups().stream()
                .filter(g -> g.getName().equalsIgnoreCase(groupName))
                .findFirst().orElse(null);
            if (group != null) {
                Group current = groupManager.getPlayerGroup(playerId);
                if (current != null) groupManager.leaveGroup(playerId);
                groupManager.joinGroup(playerId, group.getGroupId());
                logger.atInfo().log(playerRef.getUsername() + " joined group via GUI: " + group.getName());
                rebuild();
            }
            return;
        }
        switch (action) {
            case "leave":
                Group current = groupManager.getPlayerGroup(playerId);
                if (current != null) {
                    groupManager.leaveGroup(playerId);
                    logger.atInfo().log(playerRef.getUsername() + " left group via GUI: " + current.getName());
                    rebuild();
                }
                break;
            case "create":
                // Create a non-permanent group with a short unique name
                String name = "VC-" + playerId.toString().substring(0, 4);
                Group created = groupManager.createGroup(name, false);
                if (created != null) {
                    groupManager.joinGroup(playerId, created.getGroupId());
                    logger.atInfo().log(playerRef.getUsername() + " created and joined group via GUI: " + created.getName());
                    rebuild();
                }
                break;
            case "close":
                close();
                break;
        }
    }

    public static class VoiceGroupEventData {
        public static final BuilderCodec<VoiceGroupEventData> CODEC =
            BuilderCodec.builder(VoiceGroupEventData.class, VoiceGroupEventData::new)
                .append(new KeyedCodec<>("Action", Codec.STRING),
                    (d, v) -> d.action = v, d -> d.action)
                .add()
                .append(new KeyedCodec<>("GroupName", Codec.STRING),
                    (d, v) -> d.groupName = v, d -> d.groupName)
                .add()
                .build();

        public String action;
        public String groupName;
    }
}
