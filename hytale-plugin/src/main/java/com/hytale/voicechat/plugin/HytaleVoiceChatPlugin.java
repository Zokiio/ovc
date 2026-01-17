package com.hytale.voicechat.plugin;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.audio.OpusCodec;
import com.hytale.voicechat.plugin.network.UDPSocketManager;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

/**
 * Hytale Plugin for Voice Chat
 * Tracks player positions and handles voice data routing
 * 
 * This plugin combines position tracking with voice server functionality
 * for proximity-based voice chat.
 */
public class HytaleVoiceChatPlugin {
    private static final Logger logger = LoggerFactory.getLogger(HytaleVoiceChatPlugin.class);
    
    private UDPSocketManager udpServer;
    private OpusCodec opusCodec;
    private PlayerPositionTracker positionTracker;
    private int voicePort;

    public HytaleVoiceChatPlugin() {
        this.voicePort = NetworkConfig.DEFAULT_VOICE_PORT;
    }

    /**
     * Called when the plugin is enabled
     */
    public void onEnable() {
        logger.info("Hytale Voice Chat Plugin enabling...");
        
        try {
            // Initialize Opus codec
            opusCodec = new OpusCodec();
            
            // Initialize position tracker
            positionTracker = new PlayerPositionTracker();
            
            // Initialize and start UDP voice server
            udpServer = new UDPSocketManager(voicePort);
            udpServer.setPositionTracker(positionTracker);
            udpServer.start();
            
            // Start position tracking
            positionTracker.start();
            
            // TODO: Register Hytale event listeners when API is available
            // registerEventListeners();
            
            logger.info("Hytale Voice Chat Plugin enabled on port {}", voicePort);
        } catch (Exception e) {
            logger.error("Failed to enable Hytale Voice Chat Plugin", e);
        }
    }
    
    /**
     * Called when the plugin is disabled
     */
    public void onDisable() {
        logger.info("Hytale Voice Chat Plugin disabling...");
        
        if (positionTracker != null) {
            positionTracker.stop();
        }
        
        if (udpServer != null) {
            udpServer.stop();
        }
        
        logger.info("Hytale Voice Chat Plugin disabled");
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
            logger.info("Player joined voice chat: {} ({})", playerName, playerId);
        }
    }
    
    /**
     * Handle player quit
     */
    public void onPlayerQuit(UUID playerId) {
        if (positionTracker != null) {
            positionTracker.removePlayer(playerId);
            logger.info("Player left voice chat: {}", playerId);
        }
    }

    /**
     * Configure the voice server port
     */
    public void configure(int voicePort) {
        this.voicePort = voicePort;
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
