package com.hytale.voicechat.plugin.gui;

import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.entity.entities.Player;
import com.hypixel.hytale.server.core.entity.entities.player.pages.PageManager;
import com.hypixel.hytale.server.core.entity.entities.player.pages.choices.ChoiceBasePage;
import com.hypixel.hytale.server.core.entity.entities.player.pages.choices.ChoiceElement;
import com.hypixel.hytale.server.core.entity.entities.player.pages.choices.ChoiceInteraction;
import com.hypixel.hytale.server.core.entity.entities.player.pages.choices.ChoiceRequirement;
import com.hypixel.hytale.server.core.ui.builder.UICommandBuilder;
import com.hypixel.hytale.server.core.ui.builder.UIEventBuilder;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.common.model.Group;
import com.hytale.voicechat.plugin.GroupManager;

import javax.annotation.Nonnull;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class VoiceGroupChoicePage extends ChoiceBasePage {
    private static final String PAGE_LAYOUT = "Pages/ItemRepairPage.ui";
    private static final String ITEM_ELEMENT = "Pages/ItemRepairElement.ui";
    private static final String DEFAULT_ICON_ITEM = "Weapon_Sword_Wood";

    private final GroupManager groupManager;

    public VoiceGroupChoicePage(@Nonnull PlayerRef playerRef, @Nonnull GroupManager groupManager) {
        super(playerRef, buildElements(playerRef, groupManager), PAGE_LAYOUT);
        this.groupManager = groupManager;
    }

    @Override
    public void build(@Nonnull Ref<EntityStore> ref, @Nonnull UICommandBuilder commands,
                      @Nonnull UIEventBuilder events, @Nonnull Store<EntityStore> store) {
        super.build(ref, commands, events, store);
    }

    private static ChoiceElement[] buildElements(PlayerRef playerRef, GroupManager groupManager) {
        List<ChoiceElement> elements = new ArrayList<>();
        UUID playerId = playerRef.getUuid();
        Group current = groupManager.getPlayerGroup(playerId);

        if (current == null) {
            elements.add(new VoiceGroupChoiceElement(
                "Create group",
                "Create a new voice group",
                DEFAULT_ICON_ITEM,
                createInteraction(groupManager))
            );
        } else {
            elements.add(new VoiceGroupChoiceElement(
                "Leave group",
                "Leave " + current.getName(),
                DEFAULT_ICON_ITEM,
                leaveInteraction(groupManager))
            );
        }

        List<Group> groups = groupManager.listGroups();
        if (groups.isEmpty()) {
            elements.add(new VoiceGroupChoiceElement(
                "No groups available",
                "Create one to get started",
                DEFAULT_ICON_ITEM,
                noopInteraction())
            );
        } else {
            for (Group group : groups) {
                elements.add(new VoiceGroupChoiceElement(
                    "Join " + group.getName(),
                    "Members: " + group.getMemberCount(),
                    DEFAULT_ICON_ITEM,
                    joinInteraction(groupManager, group.getGroupId()))
                );
            }
        }

        return elements.toArray(new ChoiceElement[0]);
    }

    private static ChoiceInteraction createInteraction(GroupManager groupManager) {
        return new ChoiceInteraction() {
            @Override
            public void run(Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef playerRef) {
                String name = "VC-" + playerRef.getUuid().toString().substring(0, 4);
                Group created = groupManager.createGroup(name, false);
                if (created != null) {
                    groupManager.joinGroup(playerRef.getUuid(), created.getGroupId());
                }
                reopenMenu(store, ref, playerRef, groupManager);
            }
        };
    }

    private static ChoiceInteraction leaveInteraction(GroupManager groupManager) {
        return new ChoiceInteraction() {
            @Override
            public void run(Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef playerRef) {
                groupManager.leaveGroup(playerRef.getUuid());
                reopenMenu(store, ref, playerRef, groupManager);
            }
        };
    }

    private static ChoiceInteraction joinInteraction(GroupManager groupManager, UUID groupId) {
        return new ChoiceInteraction() {
            @Override
            public void run(Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef playerRef) {
                Group current = groupManager.getPlayerGroup(playerRef.getUuid());
                if (current != null) {
                    groupManager.leaveGroup(playerRef.getUuid());
                }
                groupManager.joinGroup(playerRef.getUuid(), groupId);
                reopenMenu(store, ref, playerRef, groupManager);
            }
        };
    }

    private static ChoiceInteraction noopInteraction() {
        return new ChoiceInteraction() {
            @Override
            public void run(Store<EntityStore> store, Ref<EntityStore> ref, PlayerRef playerRef) {
                // No-op
            }
        };
    }

    private static void reopenMenu(Store<EntityStore> store, Ref<EntityStore> ref,
                                   PlayerRef playerRef, GroupManager groupManager) {
        Player player = store.getComponent(ref, Player.getComponentType());
        if (player == null) {
            return;
        }
        PageManager pageManager = player.getPageManager();
        pageManager.openCustomPage(ref, store, new VoiceGroupChoicePage(playerRef, groupManager));
    }

    private static class VoiceGroupChoiceElement extends ChoiceElement {
        private final String label;
        private final String description;
        private final String itemId;

        VoiceGroupChoiceElement(String label, String description, String itemId, ChoiceInteraction interaction) {
            super("", "", new ChoiceInteraction[] { interaction }, new ChoiceRequirement[0]);
            this.label = label;
            this.description = description;
            this.itemId = itemId;
        }

        @Override
        public void addButton(UICommandBuilder commands, UIEventBuilder events,
                              String selector, PlayerRef playerRef) {
            commands.append("#ElementList", ITEM_ELEMENT);
            commands.set(selector + " #Icon.ItemId", itemId);
            commands.set(selector + " #Name.TextSpans", Message.raw(label));
            commands.set(selector + " #Durability.Text", description);
        }
    }
}