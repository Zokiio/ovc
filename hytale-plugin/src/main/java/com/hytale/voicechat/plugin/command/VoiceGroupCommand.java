package com.hytale.voicechat.plugin.command;

import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.command.system.CommandContext;
import com.hypixel.hytale.server.core.command.system.arguments.system.OptionalArg;
import com.hypixel.hytale.server.core.command.system.arguments.system.RequiredArg;
import com.hypixel.hytale.server.core.command.system.arguments.types.ArgTypes;
import com.hypixel.hytale.server.core.command.system.basecommands.AbstractCommandCollection;
import com.hypixel.hytale.server.core.command.system.basecommands.CommandBase;
import com.hypixel.hytale.server.core.entity.entities.Player;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.World;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.common.model.Group;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.plugin.HytaleVoiceChatPlugin;
import com.hytale.voicechat.plugin.gui.VoiceChatPage;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Main voice command collection: /voicechat create|join|leave|list|gui|proximity
 * Aliases: /vc
 */
public class VoiceGroupCommand extends AbstractCommandCollection {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    public VoiceGroupCommand(GroupManager groupManager, HytaleVoiceChatPlugin plugin) {
        super("voicechat", "Manage voice chat");
        addAliases("vc");

        addSubCommand(new CreateSubCommand(groupManager));
        addSubCommand(new JoinSubCommand(groupManager));
        addSubCommand(new LeaveSubCommand(groupManager));
        addSubCommand(new ListSubCommand(groupManager));
        addSubCommand(new GuiSubCommand(groupManager, plugin));
        addSubCommand(new HudSubCommand(plugin));
        addSubCommand(new MuteSubCommand(plugin));
        addSubCommand(new IsolatedSubCommand(groupManager));
        addSubCommand(new ProximitySubCommand(plugin));
        addSubCommand(new LoginSubCommand(plugin));
        addSubCommand(new ResetCodeSubCommand(plugin));
    }

    @Override
    protected boolean canGeneratePermission() {
        return false;  // Open to all players
    }

    // Create subcommand
    static class CreateSubCommand extends CommandBase {
        private final GroupManager groupManager;
        private final RequiredArg<String> nameArg;

        CreateSubCommand(GroupManager groupManager) {
            super("create", "Create a new voice group");
            this.groupManager = groupManager;
            this.nameArg = withRequiredArg("name", "Group name", ArgTypes.STRING);
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            UUID playerId = context.sender().getUuid();
            if (playerId == null) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            String name = context.get(nameArg);
            Group group = groupManager.createGroup(name, false, playerId);
            if (group == null) {
                context.sendMessage(Message.raw("Failed to create group."));
                return;
            }

            groupManager.joinGroup(playerId, group.getGroupId());
            context.sendMessage(Message.raw("Group created: " + group.getName()));
            logger.atInfo().log("Group created: " + name + " by " + context.sender().getDisplayName());
        }
    }

    // Join subcommand
    static class JoinSubCommand extends CommandBase {
        private final GroupManager groupManager;
        private final RequiredArg<String> nameArg;

        JoinSubCommand(GroupManager groupManager) {
            super("join", "Join an existing voice group");
            this.groupManager = groupManager;
            this.nameArg = withRequiredArg("name", "Group name", ArgTypes.STRING);
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            UUID playerId = context.sender().getUuid();
            if (playerId == null) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            String name = context.get(nameArg);
            Group group = groupManager.listGroups().stream()
                .filter(g -> g.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);

            if (group == null) {
                context.sendMessage(Message.raw("Group not found: " + name));
                return;
            }

            Group current = groupManager.getPlayerGroup(playerId);
            if (current != null) groupManager.leaveGroup(playerId);

            if (groupManager.joinGroup(playerId, group.getGroupId())) {
                context.sendMessage(Message.raw("Joined group: " + group.getName()));
                logger.atInfo().log(context.sender().getDisplayName() + " joined group: " + name);
            } else {
                context.sendMessage(Message.raw("Failed to join group."));
            }
        }
    }

    // Leave subcommand
    static class LeaveSubCommand extends CommandBase {
        private final GroupManager groupManager;

        LeaveSubCommand(GroupManager groupManager) {
            super("leave", "Leave your current voice group");
            this.groupManager = groupManager;
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            UUID playerId = context.sender().getUuid();
            if (playerId == null) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            Group current = groupManager.getPlayerGroup(playerId);
            if (current == null) {
                context.sendMessage(Message.raw("You are not in a group."));
                return;
            }

            String groupName = current.getName();

            UUID newOwner = groupManager.leaveGroup(playerId);
            context.sendMessage(Message.raw("Left group: " + groupName));
            logger.atInfo().log(context.sender().getDisplayName() + " left group: " + groupName);
            
            if (newOwner != null) {
                context.sendMessage(Message.raw("Ownership transferred to another member."));
            }
        }
    }

    // List subcommand
    static class ListSubCommand extends CommandBase {
        private final GroupManager groupManager;

        ListSubCommand(GroupManager groupManager) {
            super("list", "List all available voice groups");
            this.groupManager = groupManager;
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            UUID playerId = context.sender().getUuid();
            Group currentGroup = playerId != null ? groupManager.getPlayerGroup(playerId) : null;

            StringBuilder sb = new StringBuilder("=== Voice Groups ===\n");
            if (currentGroup != null) {
                sb.append("Your group: ").append(currentGroup.getName())
                  .append(" (").append(currentGroup.getMemberCount()).append(" members)\n\n");
            }

            java.util.List<Group> groups = groupManager.listGroups();
            if (groups.isEmpty()) {
                sb.append("No groups available\n");
            } else {
                sb.append("Available groups:\n");
                groups.forEach(g -> sb.append("  ").append(g.getName())
                    .append(" (").append(g.getMemberCount()).append(" members)\n"));
            }

            context.sendMessage(Message.raw(sb.toString()));
        }
    }

    // GUI subcommand
    static class GuiSubCommand extends CommandBase {
        private final GroupManager groupManager;
        private final HytaleVoiceChatPlugin plugin;

        GuiSubCommand(GroupManager groupManager, HytaleVoiceChatPlugin plugin) {
            super("gui", "Open voice chat GUI");
            this.groupManager = groupManager;
            this.plugin = plugin;
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            if (!(context.sender() instanceof Player player)) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            Ref<EntityStore> ref = player.getReference();
            if (ref == null || !ref.isValid()) {
                context.sendMessage(Message.raw("You must be in a world to use this command."));
                return;
            }

            Store<EntityStore> store = ref.getStore();
            World world = store.getExternalData().getWorld();

            CompletableFuture.runAsync(() -> {
                try {
                    PlayerRef playerRefComponent = store.getComponent(ref, PlayerRef.getComponentType());
                    if (playerRefComponent == null) {
                        context.sendMessage(Message.raw("Unable to open voice chat GUI: player reference is unavailable."));
                        logger.atWarning().log("Failed to open voice chat GUI for {}: PlayerRef component was null", player.getDisplayName());
                        return;
                    }

                    player.getPageManager().openCustomPage(ref, store,
                            new VoiceChatPage(playerRefComponent, groupManager, plugin));
                } catch (Exception e) {
                    logger.atSevere().log("Failed to open voice chat GUI for " + player.getDisplayName() + ": " + e.getMessage());
                    context.sendMessage(Message.raw("An error occurred while opening the voice chat GUI. Please try again later."));
                }
            }, world);
        }
    }

    // HUD subcommand
    static class HudSubCommand extends CommandBase {
        private final HytaleVoiceChatPlugin plugin;
        private final OptionalArg<Boolean> enabledArg;

        HudSubCommand(HytaleVoiceChatPlugin plugin) {
            super("hud", "Toggle voice chat mic HUD");
            this.plugin = plugin;
            this.enabledArg = withOptionalArg("enabled", "true/false", ArgTypes.BOOLEAN);
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            if (!(context.sender() instanceof Player player)) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            UUID playerId = player.getUuid();
            if (playerId == null) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            if (!context.provided(enabledArg)) {
                boolean hidden = plugin.toggleHudHidden(playerId);
                context.sendMessage(Message.raw("Voice HUD " + (hidden ? "hidden" : "shown") + "."));
                return;
            }

            boolean enabled = context.get(enabledArg);
            plugin.setHudHidden(playerId, !enabled);
            context.sendMessage(Message.raw("Voice HUD " + (enabled ? "enabled" : "hidden") + "."));
        }
    }

    // Mute subcommand
    static class MuteSubCommand extends CommandBase {
        private final HytaleVoiceChatPlugin plugin;
        private final OptionalArg<Boolean> enabledArg;

        MuteSubCommand(HytaleVoiceChatPlugin plugin) {
            super("mute", "Toggle web client microphone mute");
            this.plugin = plugin;
            this.enabledArg = withOptionalArg("enabled", "true/false", ArgTypes.BOOLEAN);
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            if (!(context.sender() instanceof Player player)) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            UUID playerId = player.getUuid();
            if (playerId == null) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            if (plugin.getWebRTCServer() == null || !plugin.getWebRTCServer().isWebClientConnected(playerId)) {
                context.sendMessage(Message.raw("Web client is not connected."));
                return;
            }

            boolean targetMuted = context.provided(enabledArg)
                ? context.get(enabledArg)
                : !plugin.getWebRTCServer().isWebClientMuted(playerId);

            boolean success = plugin.getWebRTCServer().setClientMuted(playerId, targetMuted, true);
            if (!success) {
                context.sendMessage(Message.raw("Web client is not connected."));
                return;
            }

            context.sendMessage(Message.raw("Web client microphone " + (targetMuted ? "muted" : "unmuted") + "."));
        }
    }

    // Spatial subcommand
    // Isolated subcommand
    static class IsolatedSubCommand extends CommandBase {
        private final GroupManager groupManager;
        private final RequiredArg<Boolean> enabledArg;

        IsolatedSubCommand(GroupManager groupManager) {
            super("isolated", "Toggle isolation mode for your group (creator only)");
            this.groupManager = groupManager;
            this.enabledArg = withRequiredArg("enabled", "true/false", ArgTypes.BOOLEAN);
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            UUID playerId = context.sender().getUuid();
            if (playerId == null) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            Group group = groupManager.getPlayerGroup(playerId);
            if (group == null) {
                context.sendMessage(Message.raw("You are not in a group."));
                return;
            }

            if (!group.isCreator(playerId)) {
                context.sendMessage(Message.raw("Only the group creator can change settings."));
                return;
            }

            boolean enabled = context.get(enabledArg);
            boolean success = groupManager.updateGroupSettings(
                group.getGroupId(),
                playerId,
                enabled
            );

            if (success) {
                context.sendMessage(Message.raw("Isolation mode " + (enabled ? "enabled" : "disabled") + " for group: " + group.getName()));
                logger.atInfo().log(context.sender().getDisplayName() + " set isolated=" + enabled + " for group " + group.getName());
            } else {
                context.sendMessage(Message.raw("Failed to update group settings."));
            }
        }
    }

    // Proximity subcommand
    static class ProximitySubCommand extends CommandBase {
        private final HytaleVoiceChatPlugin plugin;
        private final OptionalArg<Double> distanceArg;

        ProximitySubCommand(HytaleVoiceChatPlugin plugin) {
            super("proximity", "Configure voice chat proximity distance");
            this.plugin = plugin;
            this.distanceArg = withOptionalArg("distance", "Distance in blocks", ArgTypes.DOUBLE);
            
            // Require admin permission
            requirePermission("voicechat.admin.proximity");
        }

        @Override
        protected boolean canGeneratePermission() {
            return true; // Requires permission
        }

        @Override
        protected void executeSync(CommandContext context) {
            if (!context.provided(distanceArg)) {
                // Display current proximity
                double currentDistance = plugin.getProximityDistance();
                context.sendMessage(Message.raw(
                    "Current proximity: " + String.format("%.1f", currentDistance) + " blocks\n" +
                    "Usage: /voicechat proximity <distance>"
                ));
                return;
            }

            double newDistance = context.get(distanceArg);
            
            if (newDistance < 1.0 || newDistance > NetworkConfig.MAX_VOICE_DISTANCE) {
                context.sendMessage(Message.raw("Distance must be between 1.0 and " + NetworkConfig.MAX_VOICE_DISTANCE + " blocks"));
                return;
            }

            plugin.configureProximity(newDistance);
            context.sendMessage(Message.raw("Proximity distance set to " + String.format("%.1f", newDistance) + " blocks"));
            logger.atInfo().log("Proximity updated to " + newDistance + " by " + context.sender().getDisplayName());
        }
    }

    // Login subcommand - generates auth code for web UI
    static class LoginSubCommand extends CommandBase {
        private final HytaleVoiceChatPlugin plugin;

        LoginSubCommand(HytaleVoiceChatPlugin plugin) {
            super("login", "Get your voice chat login code for the web UI");
            this.plugin = plugin;
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            if (!(context.sender() instanceof Player player)) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            String username = player.getDisplayName();
            @SuppressWarnings("removal")
            UUID playerId = player.getUuid();
            
            // Get existing code or create a new one
            String code = plugin.getAuthCodeStore().getOrCreateCode(username, playerId);
            
            context.sendMessage(Message.raw("=== Voice Chat Login ==="));
            context.sendMessage(Message.raw("Your login code: " + code));
            context.sendMessage(Message.raw("Use this code with your username in the web UI."));
            context.sendMessage(Message.raw("Use /vc resetcode to generate a new code."));
            logger.atInfo().log("Player " + username + " retrieved login code");
        }
    }

    // Reset code subcommand - generates a new auth code
    static class ResetCodeSubCommand extends CommandBase {
        private final HytaleVoiceChatPlugin plugin;

        ResetCodeSubCommand(HytaleVoiceChatPlugin plugin) {
            super("resetcode", "Generate a new voice chat login code");
            this.plugin = plugin;
        }

        @Override
        protected boolean canGeneratePermission() {
            return false;
        }

        @Override
        protected void executeSync(CommandContext context) {
            if (!(context.sender() instanceof Player player)) {
                context.sendMessage(Message.raw("Only players can use this command."));
                return;
            }

            String username = player.getDisplayName();
            @SuppressWarnings("removal")
            UUID playerId = player.getUuid();
            
            // Generate new code (invalidates old one)
            String newCode = plugin.getAuthCodeStore().resetCode(username, playerId);
            
            context.sendMessage(Message.raw("=== Voice Chat Login ==="));
            context.sendMessage(Message.raw("Your new login code: " + newCode));
            context.sendMessage(Message.raw("Your old code is no longer valid."));
            logger.atInfo().log("Player " + username + " reset their login code");
        }
    }
}
