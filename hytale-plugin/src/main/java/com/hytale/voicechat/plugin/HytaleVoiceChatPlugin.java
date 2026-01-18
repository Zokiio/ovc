package com.hytale.voicechat.plugin;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.audio.OpusCodec;
import com.hytale.voicechat.plugin.event.PlayerJoinEventSystem;
import com.hytale.voicechat.plugin.event.PlayerMoveEventSystem;
import com.hytale.voicechat.plugin.listener.PlayerEventListener;
import com.hytale.voicechat.plugin.network.UDPSocketManager;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;

import javax.annotation.Nonnull;
import java.util.UUID;

/**
 * Hytale Plugin for Voice Chat
 * Tracks player positions and handles voice data routing
 * 
 * This plugin combines position tracking with voice server functionality
 * for proximity-based voice chat.
 */
public class HytaleVoiceChatPlugin extends JavaPlugin {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private UDPSocketManager udpServer;
    private OpusCodec opusCodec;
    private PlayerPositionTracker positionTracker;
    private PlayerEventListener eventListener;
    private int voicePort;
    private double proximityDistance = NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;

    public HytaleVoiceChatPlugin(@Nonnull JavaPluginInit init) {
        super(init);
        this.voicePort = NetworkConfig.DEFAULT_VOICE_PORT;
        logger.atInfo().log("Hytale Voice Chat Plugin initialized - version " + this.getManifest().getVersion());
    }

    /**
     * Setup method called when the plugin is enabled
     */
    @Override
    protected void setup() {
        logger.atInfo().log("Setting up Hytale Voice Chat Plugin...");
        
        try {
            // Initialize Opus codec
            opusCodec = new OpusCodec();
            
            // Initialize position tracker
            positionTracker = new PlayerPositionTracker();
            
            // Register event system for player join/quit tracking
            EntityStore.REGISTRY.registerSystem(new PlayerJoinEventSystem(positionTracker));
            EntityStore.REGISTRY.registerSystem(new PlayerMoveEventSystem(positionTracker));
            
            // Initialize event listener
            eventListener = new PlayerEventListener(positionTracker);
            
            // Initialize and start UDP voice server
            udpServer = new UDPSocketManager(voicePort);
            udpServer.setProximityDistance(proximityDistance);
            udpServer.setPositionTracker(positionTracker);
            udpServer.setEventListener(eventListener);
            udpServer.start();
            
            // Start position tracking
            positionTracker.start();
            
            logger.atInfo().log("Hytale Voice Chat Plugin setup complete - listening on port " + voicePort + " (proximity=" + proximityDistance + ")");
        } catch (Exception e) {
            logger.atSevere().log("Failed to setup Hytale Voice Chat Plugin: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Cleanup when plugin is disabled
     */
    @Override
    protected void shutdown() {
        logger.atInfo().log("Shutting down Hytale Voice Chat Plugin...");
        
        if (positionTracker != null) {
            positionTracker.stop();
        }
        
        if (udpServer != null) {
            udpServer.stop();
        }
        
        if (opusCodec != null) {
            opusCodec.close();
            opusCodec = null;
        }
        
        logger.atInfo().log("Hytale Voice Chat Plugin shutdown complete");
    }
    
    /**
     * Handle player movement
     */
    public void onPlayerMove(UUID playerId, String playerName, double x, double y, double z, String worldId) {
        if (positionTracker != null) {
            positionTracker.updatePosition(playerId, playerName, x, y, z, worldId);
        }
    }
    
    /**
     * Handle player join
     */
    public void onPlayerJoin(UUID playerId, String playerName, double x, double y, double z, String worldId) {
        if (positionTracker != null) {
            PlayerPosition position = new PlayerPosition(playerId, playerName, x, y, z, worldId);
            positionTracker.addPlayer(position);
            logger.atInfo().log("Player joined voice chat: " + playerName + " (" + playerId + ")");
        }
    }
    
    /**
     * Handle player quit
     */
    public void onPlayerQuit(UUID playerId) {
        if (positionTracker != null) {
            positionTracker.removePlayer(playerId);
            logger.atInfo().log("Player left voice chat: " + playerId);
        }
    }

    /**
     * Configure the voice server port
     */
    public void configure(int voicePort) {
        this.voicePort = voicePort;
    }

    /**
     * Configure proximity distance (blocks)
     */
    public void configureProximity(double proximityDistance) {
        this.proximityDistance = Math.max(1.0, Math.min(proximityDistance, NetworkConfig.MAX_VOICE_DISTANCE));
        if (udpServer != null) {
            udpServer.setProximityDistance(this.proximityDistance);
        }
    }

    // TODO: Register Hytale event listeners when API becomes available
    // private void registerEventListeners() {
    //     eventBus.register(PlayerMoveEvent.class, event -> {
    //         Player player = event.getPlayer();
    //         onPlayerMove(player.getUuid(), player.getName(), 
    //             player.getX(), player.getY(), player.getZ(), 
    //             player.getWorld().getId());
    //     });
    // }
}
