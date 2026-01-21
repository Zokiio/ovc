package com.hytale.voicechat.plugin.command;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.command.system.CommandContext;
import com.hypixel.hytale.server.core.command.system.arguments.system.RequiredArg;
import com.hypixel.hytale.server.core.command.system.arguments.types.ArgTypes;
import com.hypixel.hytale.server.core.command.system.basecommands.AbstractCommandCollection;
import com.hypixel.hytale.server.core.command.system.basecommands.CommandBase;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.common.model.Group;

import javax.annotation.Nonnull;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

/**
 * Command collection to manage voice groups: /voicegroup create|join|leave|list
 */
public class VoiceGroupCommand extends AbstractCommandCollection {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    public VoiceGroupCommand(GroupManager groupManager) {
        super("voicegroup", "Manage voice chat groups");
        addAliases("vgroup", "group");
        
        addSubCommand(new CreateSubCommand(groupManager));
        addSubCommand(new JoinSubCommand(groupManager));
        addSubCommand(new LeaveSubCommand(groupManager));
        addSubCommand(new ListSubCommand(groupManager));
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

            if (groupManager.leaveGroup(playerId)) {
                context.sendMessage(Message.raw("Left group: " + current.getName()));
                logger.atInfo().log(context.sender().getDisplayName() + " left group: " + current.getName());
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
}
