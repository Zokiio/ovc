package com.hytale.voicechat.plugin.gui;

import com.hypixel.hytale.codec.Codec;
import com.hypixel.hytale.codec.KeyedCodec;
import com.hypixel.hytale.codec.builder.BuilderCodec;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
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
import com.hytale.voicechat.plugin.HytaleVoiceChatPlugin;
import com.hytale.voicechat.common.model.Group;

import javax.annotation.Nonnull;
import java.awt.Color;
import java.util.List;
import java.util.UUID;

public class VoiceChatPage extends InteractiveCustomUIPage<VoiceChatPage.VoiceChatData> {

    private static final String PAGE_LAYOUT = "Pages/VoiceChatGUI.ui";
    private final GroupManager groupManager;
    private final HytaleVoiceChatPlugin plugin;
    private String groupNameInput = "";

    @SuppressWarnings("null")
    public VoiceChatPage(@Nonnull PlayerRef playerRef, @Nonnull GroupManager groupManager, @Nonnull HytaleVoiceChatPlugin plugin) {
        super(playerRef, CustomPageLifetime.CanDismiss, VoiceChatData.CODEC);
        this.groupManager = groupManager;
        this.plugin = plugin;
    }

    @SuppressWarnings("null")
    @Override
    public void build(@Nonnull Ref<EntityStore> ref, @Nonnull UICommandBuilder commands, @Nonnull UIEventBuilder events, @Nonnull Store<EntityStore> store) {
        commands.append(PAGE_LAYOUT);

        // Set initial text input value
        commands.set("#GroupNameInput.Value", groupNameInput);

        // Update initial values
        updateConnectionStatus(commands, store, ref);
        updateGroupDisplay(commands);
        updateUIVisibility(commands);
        updateGroupsList(commands);

        // Bind text input change event
        events.addEventBinding(CustomUIEventBindingType.ValueChanged, "#GroupNameInput",
                EventData.of("@GroupNameInput", "#GroupNameInput.Value"), false);

        // Bind events for all interactive elements
        events.addEventBinding(CustomUIEventBindingType.Activating, "#CloseButton",
                EventData.of("CloseClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#CreateGroupButton",
                EventData.of("CreateGroupClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#JoinGroupButton",
                EventData.of("JoinGroupClicked", "true"), false);

        events.addEventBinding(CustomUIEventBindingType.Activating, "#SmallLeaveButton",
                EventData.of("SmallLeaveClicked", "true"), false);
    }

    @SuppressWarnings("null")
    @Override
    public void handleDataEvent(@Nonnull Ref<EntityStore> ref, @Nonnull Store<EntityStore> store, @Nonnull VoiceChatData data) {
        Player player = store.getComponent(ref, Player.getComponentType());
        if (player == null) return;

        UICommandBuilder commandBuilder = new UICommandBuilder();

        // Handle text input changes
        if (data.groupNameInput != null) {
            groupNameInput = data.groupNameInput.trim();
            // Update silently, no message needed
            this.sendUpdate(commandBuilder, false);
            return;
        }

        // Handle close button
        if (data.closeClicked != null) {
            this.close();
            return;
        }

        // Handle create group
        if (data.createGroupClicked != null) {
            var existingGroup = groupManager.getPlayerGroup(playerRef.getUuid());
            if (existingGroup != null) {
                player.sendMessage(Message.raw("Leave your current voice group before creating a new one").color(Color.RED));
                return;
            }

            if (groupNameInput.isEmpty()) {
                player.sendMessage(Message.raw("Please enter a group name in the text field above").color(Color.RED));
            } else {
                Group created = groupManager.createGroup(groupNameInput, false);
                if (created == null) {
                    player.sendMessage(Message.raw("Could not create group (name invalid or already exists)").color(Color.RED));
                } else {
                    boolean joined = groupManager.joinGroup(playerRef.getUuid(), created.getGroupId());
                    if (joined) {
                        player.sendMessage(Message.join(
                                Message.raw("Created and joined group: ").color(Color.GREEN),
                                Message.raw(created.getName()).color(Color.CYAN).bold(true)
                        ));
                    } else {
                        player.sendMessage(Message.raw("Created group, but failed to join").color(Color.YELLOW));
                    }
                }
                // Clear input after use
                groupNameInput = "";
                commandBuilder.set("#GroupNameInput.Value", groupNameInput);
                updateGroupDisplay(commandBuilder);
                updateUIVisibility(commandBuilder);
                updateGroupsList(commandBuilder);
            }
        }

        // Handle join group
        if (data.joinGroupClicked != null) {
            if (groupNameInput.isEmpty()) {
                player.sendMessage(Message.raw("Please enter a group name in the text field above").color(Color.RED));
            } else {
                Group target = findGroupByName(groupNameInput);
                if (target == null) {
                    player.sendMessage(Message.join(
                            Message.raw("No group found named: ").color(Color.RED),
                            Message.raw(groupNameInput).color(Color.CYAN)
                    ));
                } else {
                    boolean joined = groupManager.joinGroup(playerRef.getUuid(), target.getGroupId());
                    if (joined) {
                        player.sendMessage(Message.join(
                                Message.raw("Joined group: ").color(Color.GREEN),
                                Message.raw(target.getName()).color(Color.CYAN).bold(true)
                        ));
                    } else {
                        player.sendMessage(Message.raw("Failed to join group").color(Color.RED));
                    }
                }
                // Clear input after use
                groupNameInput = "";
                commandBuilder.set("#GroupNameInput.Value", groupNameInput);
                updateGroupDisplay(commandBuilder);
                updateUIVisibility(commandBuilder);
                updateGroupsList(commandBuilder);
            }
        }

        // Handle leave group
        if (data.leaveGroupClicked != null || data.smallLeaveClicked != null) {
            var group = groupManager.getPlayerGroup(playerRef.getUuid());
            if (group != null) {
                boolean left = groupManager.leaveGroup(playerRef.getUuid());
                if (left) {
                    player.sendMessage(Message.join(
                            Message.raw("Left group: ").color(Color.YELLOW),
                            Message.raw(group.getName()).color(Color.CYAN)
                    ));
                }
            } else {
                player.sendMessage(Message.raw("You are not in a voice group").color(Color.YELLOW));
            }
            updateGroupDisplay(commandBuilder);
            updateUIVisibility(commandBuilder);
            updateGroupsList(commandBuilder);
        }

        // Always refresh connection status on any interaction
        updateConnectionStatus(commandBuilder, store, ref);

        // Send updates if any changes were made
        this.sendUpdate(commandBuilder, false);
    }

    @SuppressWarnings("null")
    private void updateGroupsList(UICommandBuilder commands) {
        List<Group> allGroups = groupManager.listGroups();
        var currentGroup = groupManager.getPlayerGroup(playerRef.getUuid());
        UUID currentGroupId = currentGroup != null ? currentGroup.getGroupId() : null;
        
        plugin.getLogger().atInfo().log("Updating groups list - found " + allGroups.size() + " groups");
        
        if (allGroups.isEmpty()) {
            commands.set("#GroupsListPlaceholder.Text", "No groups available.\nCreate one using the field above!");
        } else {
            StringBuilder groupsText = new StringBuilder();

            for (int i = 0; i < allGroups.size(); i++) {
                Group group = allGroups.get(i);
                boolean isCurrentGroup = group.getGroupId().equals(currentGroupId);

                plugin.getLogger().atInfo().log("Group: " + group.getName() + " (members: " + group.getMemberCount() + ")");

                groupsText.append("• ");
                groupsText.append(group.getName());
                groupsText.append(" (").append(group.getMemberCount());
                groupsText.append(group.getMemberCount() == 1 ? " member)" : " members)");
                if (isCurrentGroup) {
                    groupsText.append(" - YOUR GROUP");
                }

                if (i < allGroups.size() - 1) {
                    groupsText.append("\n");
                }
            }

            groupsText.append("\n\nEnter group name and click JOIN");
            groupsText.append("\nTotal groups: ").append(allGroups.size());
            commands.set("#GroupsListPlaceholder.Text", groupsText.toString());
        }
    }

    @SuppressWarnings("null")
    private void updateConnectionStatus(UICommandBuilder commands, Store<EntityStore> store, Ref<EntityStore> ref) {
        // Check if player has an active voice client connection
        @SuppressWarnings("null")
        Player player = store.getComponent(ref, Player.getComponentType());
        if (player != null) {
            boolean isConnected = false;
            
            // Check if player has authenticated voice client
            if (plugin.getUdpServer() != null) {
                isConnected = plugin.getUdpServer().isPlayerConnected(playerRef.getUuid());
            }
            
            if (isConnected) {
                commands.set("#ConnectionStatus.TextSpans", 
                        Message.raw("Voice Client - Connected").color(Color.GREEN).bold(true));
            } else {
                commands.set("#ConnectionStatus.TextSpans", 
                        Message.raw("Voice Client - Disconnected").color(Color.RED).bold(true));
            }
        }
    }

    private void updateGroupDisplay(UICommandBuilder commands) {
        PlayerRef playerRef = this.playerRef;
        var group = groupManager.getPlayerGroup(playerRef.getUuid());
        
        if (group != null) {
            // Update members list
            updateGroupMembers(commands, group);
        }

        updateGroupsList(commands);
    }

    @SuppressWarnings("null")
    private void updateGroupMembers(UICommandBuilder commands, Group group) {
        StringBuilder membersText = new StringBuilder();
        
        var members = group.getMembers();
        if (members.isEmpty()) {
            commands.set("#MemberCount.TextSpans", Message.raw("0 members").color(Color.GRAY));
            membersText.append("No members");
        } else {
            // Update member count in header
            String countText = members.size() + (members.size() == 1 ? " member" : " members");
            commands.set("#MemberCount.TextSpans", Message.raw(countText).color(Color.GRAY));
            
            // Build member list
            for (var memberUuid : members) {
                if (memberUuid.equals(playerRef.getUuid())) {
                    membersText.append(playerRef.getUsername()).append(" (You)").append("\n");
                } else {
                    membersText.append("Player ").append(memberUuid.toString().substring(0, 8)).append("\n");
                }
            }
        }
        
        commands.set("#MembersListContent.TextSpans",
                Message.raw(membersText.toString()).color(Color.WHITE));
    }

    private void updateUIVisibility(UICommandBuilder commands) {
        PlayerRef playerRef = this.playerRef;
        var group = groupManager.getPlayerGroup(playerRef.getUuid());
        boolean inGroup = group != null;
        
        // Keep creation controls visible to avoid layout shifts; restrict actions in handler instead
        commands.set("#CreateGroupButton.Visible", true);
        commands.set("#GroupNameInputSection.Visible", true);

        // Disable and gray out create when already in a group to show it is unavailable
        commands.set("#CreateGroupButton.Disabled", inGroup);

        // Show/hide small leave button (visible only when IN a group)
        commands.set("#SmallLeaveButton.Visible", inGroup);
        
        // Show/hide Group Members Section (visible only when IN a group)
        commands.set("#GroupMembersSection.Visible", inGroup);

        updateGroupsList(commands);
    }

    private Group findGroupByName(String name) {
        return groupManager.listGroups().stream()
                .filter(g -> g.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);
    }

    public static class VoiceChatData {
        static final String KEY_GROUP_NAME_INPUT = "@GroupNameInput";
        static final String KEY_CLOSE = "CloseClicked";
        static final String KEY_CREATE_GROUP = "CreateGroupClicked";
        static final String KEY_JOIN_GROUP = "JoinGroupClicked";
        static final String KEY_LEAVE_GROUP = "LeaveGroupClicked";
        static final String KEY_SMALL_LEAVE = "SmallLeaveClicked";

        public static final BuilderCodec<VoiceChatData> CODEC = BuilderCodec.builder(VoiceChatData.class, VoiceChatData::new)
            .addField(new KeyedCodec<>(KEY_GROUP_NAME_INPUT, Codec.STRING), (d, v) -> d.groupNameInput = v, d -> d.groupNameInput == null ? "" : d.groupNameInput)
            .addField(new KeyedCodec<>(KEY_CLOSE, Codec.STRING), (d, v) -> d.closeClicked = v, d -> d.closeClicked == null ? "" : d.closeClicked)
            .addField(new KeyedCodec<>(KEY_CREATE_GROUP, Codec.STRING), (d, v) -> d.createGroupClicked = v, d -> d.createGroupClicked == null ? "" : d.createGroupClicked)
            .addField(new KeyedCodec<>(KEY_JOIN_GROUP, Codec.STRING), (d, v) -> d.joinGroupClicked = v, d -> d.joinGroupClicked == null ? "" : d.joinGroupClicked)
            .addField(new KeyedCodec<>(KEY_LEAVE_GROUP, Codec.STRING), (d, v) -> d.leaveGroupClicked = v, d -> d.leaveGroupClicked == null ? "" : d.leaveGroupClicked)
            .addField(new KeyedCodec<>(KEY_SMALL_LEAVE, Codec.STRING), (d, v) -> d.smallLeaveClicked = v, d -> d.smallLeaveClicked == null ? "" : d.smallLeaveClicked)
                .build();

        private String groupNameInput;
        private String closeClicked;
        private String createGroupClicked;
        private String joinGroupClicked;
        private String leaveGroupClicked;
        private String smallLeaveClicked;
    }
}
