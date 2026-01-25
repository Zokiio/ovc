package com.hytale.voicechat.plugin.command;

import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.command.system.CommandContext;
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

import javax.annotation.Nonnull;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Main voice command collection: /voicechat create|join|leave|list|gui|proximity
 * Aliases: /vc
 */
public class VoiceGroupCommand extends AbstractCommandCollection {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private final GroupManager groupManager;
    private final HytaleVoiceChatPlugin plugin;

    public VoiceGroupCommand(GroupManager groupManager, HytaleVoiceChatPlugin plugin) {
        super("voicechat", "Manage voice chat");
        this.groupManager = groupManager;
        this.plugin = plugin;
        addAliases("vc");

        addSubCommand(new CreateSubCommand(groupManager));
        addSubCommand(new JoinSubCommand(groupManager));
        addSubCommand(new LeaveSubCommand(groupManager));
        addSubCommand(new ListSubCommand(groupManager));
        addSubCommand(new GuiSubCommand(groupManager, plugin));
        addSubCommand(new ProximitySubCommand(plugin));
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
            Group group = groupManager.createGroup(name, false);
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

            if (groupManager.leaveGroup(playerId)) {
                context.sendMessage(Message.raw("Left group: " + groupName));
                logger.atInfo().log(context.sender().getDisplayName() + " left group: " + groupName);
            } else {
                context.sendMessage(Message.raw("Failed to leave group."));
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
                PlayerRef playerRefComponent = store.getComponent(ref, PlayerRef.getComponentType());
                if (playerRefComponent != null) {
                    player.getPageManager().openCustomPage(ref, store,
                            new VoiceChatPage(playerRefComponent, groupManager, plugin));
                }
            }, world);
        }
    }

    // Proximity subcommand
    static class ProximitySubCommand extends CommandBase {
        private final HytaleVoiceChatPlugin plugin;
        private final RequiredArg<Double> distanceArg;

        ProximitySubCommand(HytaleVoiceChatPlugin plugin) {
            super("proximity", "Configure voice chat proximity distance");
            this.plugin = plugin;
            this.distanceArg = withRequiredArg("distance", "Distance in blocks (1.0-100.0)", ArgTypes.DOUBLE);
            
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
}
