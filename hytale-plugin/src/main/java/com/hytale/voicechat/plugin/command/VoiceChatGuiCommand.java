package com.hytale.voicechat.plugin.command;

import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.plugin.HytaleVoiceChatPlugin;
import com.hytale.voicechat.plugin.gui.VoiceChatPage;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.protocol.GameMode;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.command.system.CommandContext;
import com.hypixel.hytale.server.core.command.system.CommandSender;
import com.hypixel.hytale.server.core.command.system.basecommands.AbstractAsyncCommand;
import com.hypixel.hytale.server.core.entity.entities.Player;
import com.hypixel.hytale.server.core.universe.PlayerRef;
import com.hypixel.hytale.server.core.universe.world.World;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import org.checkerframework.checker.nullness.compatqual.NonNullDecl;

import java.util.concurrent.CompletableFuture;

public class VoiceChatGuiCommand extends AbstractAsyncCommand {

    private static final String MESSAGE_PLAYER_NOT_IN_WORLD = "You must be in a world to use this command.";

    private final GroupManager groupManager;
    private final HytaleVoiceChatPlugin plugin;

    public VoiceChatGuiCommand(GroupManager groupManager, HytaleVoiceChatPlugin plugin) {
        super("voicechat", "Opens the voice chat settings GUI");
        this.addAliases("vc", "voice");
        this.setPermissionGroup(GameMode.Adventure);
        this.groupManager = groupManager;
        this.plugin = plugin;
    }

    @NonNullDecl
    @Override
    protected CompletableFuture<Void> executeAsync(CommandContext commandContext) {
        CommandSender sender = commandContext.sender();
        
        if (sender instanceof Player player) {
            Ref<EntityStore> ref = player.getReference();
            
            if (ref != null && ref.isValid()) {
                Store<EntityStore> store = ref.getStore();
                World world = store.getExternalData().getWorld();
                
                return CompletableFuture.runAsync(() -> {
                    PlayerRef playerRefComponent = store.getComponent(ref, PlayerRef.getComponentType());
                    
                    if (playerRefComponent != null) {
                        player.getPageManager().openCustomPage(ref, store, 
                                new VoiceChatPage(playerRefComponent, groupManager, plugin));
                    }
                }, world);
            } else {
                commandContext.sendMessage(Message.raw(MESSAGE_PLAYER_NOT_IN_WORLD));
                return CompletableFuture.completedFuture(null);
            }
        } else {
            commandContext.sendMessage(Message.raw("Only players can use this command."));
            return CompletableFuture.completedFuture(null);
        }
    }
}
