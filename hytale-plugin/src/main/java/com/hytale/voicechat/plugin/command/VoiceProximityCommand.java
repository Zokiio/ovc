package com.hytale.voicechat.plugin.command;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.command.system.CommandContext;
import com.hypixel.hytale.server.core.command.system.arguments.system.OptionalArg;
import com.hypixel.hytale.server.core.command.system.arguments.types.ArgTypes;
import com.hypixel.hytale.server.core.command.system.basecommands.CommandBase;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.HytaleVoiceChatPlugin;

/**
 * Command to configure voice chat proximity distance
 * Usage: /voiceproximity [distance]
 * - No arguments: displays current proximity distance
 * - With distance: sets new proximity distance (1.0 to 100.0 blocks)
 */
public class VoiceProximityCommand extends CommandBase {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final HytaleVoiceChatPlugin plugin;
    
    // Optional distance argument
    private final OptionalArg<Double> distanceArg = 
        withOptionalArg("distance", "voicechat.command.proximity.distance.desc", ArgTypes.DOUBLE);
    
    public VoiceProximityCommand(HytaleVoiceChatPlugin plugin) {
        super("voiceproximity", "voicechat.command.proximity.desc");
        this.plugin = plugin;
        
        // Add aliases for convenience
        addAliases("vproximity", "voicedistance");
        
        // Require admin permission
        requirePermission("voicechat.admin.proximity");
    }
    
    @Override
    protected void executeSync(CommandContext context) {
        if (context.provided(distanceArg)) {
            // Set new proximity distance
            double newDistance = context.get(distanceArg);
            
            // Validate range
            if (newDistance < 1.0 || newDistance > NetworkConfig.MAX_VOICE_DISTANCE) {
                context.sendMessage(Message.raw(
                    "§cInvalid distance! Must be between 1.0 and " + 
                    NetworkConfig.MAX_VOICE_DISTANCE + " blocks."
                ));
                return;
            }
            
            // Update proximity distance
            plugin.configureProximity(newDistance);
            
            context.sendMessage(Message.raw(
                "§aVoice chat proximity distance set to §e" + 
                String.format("%.1f", newDistance) + " §ablocks."
            ));
            
            logger.atInfo().log("Proximity distance updated to " + newDistance + " blocks by " + context.sender().getDisplayName());
        } else {
            // Display current proximity distance
            double currentDistance = plugin.getProximityDistance();
            context.sendMessage(Message.raw(
                "§7Current voice chat proximity distance: §e" + 
                String.format("%.1f", currentDistance) + " §7blocks\n" +
                "§7Range: §e1.0 - " + NetworkConfig.MAX_VOICE_DISTANCE + " §7blocks\n" +
                "§7Usage: §f/voiceproximity <distance>"
            ));
        }
    }
}
