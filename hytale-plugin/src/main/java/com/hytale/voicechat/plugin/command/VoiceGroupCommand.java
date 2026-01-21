package com.hytale.voicechat.plugin.command;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.command.system.CommandContext;
import com.hypixel.hytale.server.core.command.system.arguments.system.OptionalArg;
import com.hypixel.hytale.server.core.command.system.arguments.types.ArgTypes;
import com.hypixel.hytale.server.core.command.system.basecommands.CommandBase;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.common.model.Group;

import java.util.UUID;

/**
 * Command to manage voice groups
 * Usage:
 * - /voicegroup - Shows group management menu
 * - /voicegroup create <name> - Create a new group
 * - /voicegroup create <name> --permanent - Create permanent group (admin only)
 * - /voicegroup join <name> - Join a group
 * - /voicegroup leave - Leave current group
 * - /voicegroup list - List available groups
 */
public class VoiceGroupCommand extends CommandBase {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final GroupManager groupManager;
    
    private final OptionalArg<String> subcommand = 
        withOptionalArg("subcommand", "voicechat.command.group.subcommand.desc", ArgTypes.STRING);
    
    private final OptionalArg<String> groupName = 
        withOptionalArg("name", "voicechat.command.group.name.desc", ArgTypes.STRING);

    public VoiceGroupCommand(GroupManager groupManager) {
        super("voicegroup", "voicechat.command.group.desc");
        this.groupManager = groupManager;
        
        // Add aliases
        addAliases("vgroup", "group");
        
        // Base permission required for all
        requirePermission("voicechat.group.use");
    }

    @Override
    protected void executeSync(CommandContext context) {
        String displayName = context.sender().getDisplayName();
        UUID playerId = UUID.nameUUIDFromBytes(displayName.getBytes());
        
        if (!context.provided(subcommand)) {
            // No subcommand - list available groups
            showGroupMenu(context, playerId);
            return;
        }

        String cmd = context.get(subcommand).toLowerCase();

        switch (cmd) {
            case "create":
                handleCreate(context, playerId);
                break;
            case "join":
                handleJoin(context, playerId);
                break;
            case "leave":
                handleLeave(context, playerId);
                break;
            case "list":
                handleList(context);
                break;
            default:
                context.sendMessage(Message.raw(
                    "§cUnknown subcommand: §e" + cmd + "\n" +
                    "§7Valid commands: §fcreate, join, leave, list"
                ));
        }
    }

    /**
     * Show group menu with available groups
     */
    private void showGroupMenu(CommandContext context, UUID playerId) {
        Group currentGroup = groupManager.getPlayerGroup(playerId);
        
        StringBuilder sb = new StringBuilder();
        sb.append("§6=== Voice Group Menu ===\n");
        
        if (currentGroup != null) {
            sb.append("§aYour Group: §f").append(currentGroup.getName()).append(" (")
              .append(currentGroup.getMemberCount()).append(" members)\n");
            sb.append("§7Members: ");
            currentGroup.getMembers().stream()
                .limit(5)
                .forEach(id -> sb.append(id.toString().substring(0, 8)).append(", "));
            if (currentGroup.getMemberCount() > 5) {
                sb.append("...");
            }
            sb.append("\n");
            sb.append("§7/voicegroup leave - Leave group\n");
        } else {
            sb.append("§7You are not in a group\n");
        }
        
        sb.append("\n§6Available Groups:\n");
        
        java.util.List<Group> groups = groupManager.listGroups();
        if (groups.isEmpty()) {
            sb.append("§7No groups available\n");
        } else {
            groups.stream().limit(10).forEach(g -> 
                sb.append("§f").append(g.getName()).append(" §7(")
                  .append(g.getMemberCount()).append(" members) ")
                  .append("§e/voicegroup join ").append(g.getName()).append("\n")
            );
            if (groups.size() > 10) {
                sb.append("§7... and ").append(groups.size() - 10).append(" more groups\n");
            }
        }
        
        sb.append("\n§f/voicegroup create <name> - Create new group");
        
        context.sendMessage(Message.raw(sb.toString()));
    }

    /**
     * Handle group creation
     */
    private void handleCreate(CommandContext context, UUID playerId) {
        if (!context.provided(groupName)) {
            context.sendMessage(Message.raw("§cUsage: /voicegroup create <name> [--permanent]"));
            return;
        }

        String name = context.get(groupName);
        
        // Check for --permanent flag (admin only)
        boolean isPermanent = false;
        if (name.endsWith(" --permanent")) {
            if (!context.sender().hasPermission("voicechat.group.permanent")) {
                context.sendMessage(Message.raw("§cYou don't have permission to create permanent groups"));
                return;
            }
            isPermanent = true;
            name = name.replace(" --permanent", "").trim();
        }

        Group group = groupManager.createGroup(name, isPermanent);
        if (group == null) {
            context.sendMessage(Message.raw("§cFailed to create group. Check name length (3-32 chars, alphanumeric + spaces)"));
            return;
        }

        // Auto-join the creator
        groupManager.joinGroup(playerId, group.getGroupId());
        
        context.sendMessage(Message.raw(
            "§aGroup created: §f" + group.getName() + 
            (isPermanent ? " §7(Permanent)" : "") +
            "\n§7You have been added to the group"
        ));
        
        logger.atInfo().log("Group created: " + name + " by " + context.sender().getDisplayName());
    }

    /**
     * Handle joining a group
     */
    private void handleJoin(CommandContext context, UUID playerId) {
        if (!context.provided(groupName)) {
            context.sendMessage(Message.raw("§cUsage: /voicegroup join <name>"));
            return;
        }

        String name = context.get(groupName);
        
        // Find group by name
        Group group = groupManager.listGroups().stream()
                .filter(g -> g.getName().equalsIgnoreCase(name))
                .findFirst()
                .orElse(null);

        if (group == null) {
            context.sendMessage(Message.raw("§cGroup not found: §f" + name));
            return;
        }

        // Leave current group if in one
        Group currentGroup = groupManager.getPlayerGroup(playerId);
        if (currentGroup != null) {
            groupManager.leaveGroup(playerId);
            context.sendMessage(Message.raw("§7Left group: §f" + currentGroup.getName()));
        }

        // Join new group
        if (groupManager.joinGroup(playerId, group.getGroupId())) {
            context.sendMessage(Message.raw(
                "§aJoined group: §f" + group.getName() + 
                " §7(" + group.getMemberCount() + " members)"
            ));
            logger.atInfo().log(context.sender().getDisplayName() + " joined group: " + name);
        } else {
            context.sendMessage(Message.raw("§cFailed to join group"));
        }
    }

    /**
     * Handle leaving current group
     */
    private void handleLeave(CommandContext context, UUID playerId) {
        Group currentGroup = groupManager.getPlayerGroup(playerId);
        
        if (currentGroup == null) {
            context.sendMessage(Message.raw("§cYou are not in a group"));
            return;
        }

        String groupName = currentGroup.getName();
        if (groupManager.leaveGroup(playerId)) {
            context.sendMessage(Message.raw("§aLeft group: §f" + groupName));
            logger.atInfo().log(context.sender().getDisplayName() + " left group: " + groupName);
        } else {
            context.sendMessage(Message.raw("§cFailed to leave group"));
        }
    }

    /**
     * Handle listing groups
     */
    private void handleList(CommandContext context) {
        java.util.List<Group> groups = groupManager.listGroups();
        
        StringBuilder sb = new StringBuilder();
        sb.append("§6=== Available Voice Groups ===\n");
        
        if (groups.isEmpty()) {
            sb.append("§7No groups available. Create one with: §f/voicegroup create <name>\n");
        } else {
            for (int i = 0; i < Math.min(groups.size(), 20); i++) {
                Group g = groups.get(i);
                sb.append("§f").append(g.getName())
                  .append(" §7- Members: §e").append(g.getMemberCount())
                  .append("§7, Type: ").append(g.isPermanent() ? "§cPermanent" : "§aTemporal")
                  .append("\n");
            }
            if (groups.size() > 20) {
                sb.append("§7... and ").append(groups.size() - 20).append(" more groups\n");
            }
        }
        
        context.sendMessage(Message.raw(sb.toString()));
    }
}
