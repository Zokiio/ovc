package com.hytale.voicechat.plugin;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.audio.OpusCodec;
import com.hytale.voicechat.plugin.command.VoiceGroupCommand;
import com.hytale.voicechat.plugin.event.PlayerJoinEventSystem;
import com.hytale.voicechat.plugin.event.PlayerMoveEventSystem;
import com.hytale.voicechat.plugin.event.UIRefreshTickingSystem;
import com.hytale.voicechat.plugin.listener.PlayerEventListener;
import com.hytale.voicechat.plugin.network.UDPSocketManager;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hytale.voicechat.plugin.webrtc.WebRTCAudioBridge;
import com.hytale.voicechat.plugin.webrtc.WebRTCSignalingServer;

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
    private WebRTCSignalingServer signalingServer;
    private WebRTCAudioBridge webRtcAudioBridge;
    private OpusCodec opusCodec;
    private PlayerPositionTracker positionTracker;
    private PlayerEventListener eventListener;
    private GroupManager groupManager;
    private int voicePort;
    private double proximityDistance = NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;
    // EntityStore reference not required currently for voice auth gating

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
            
            // Initialize group manager
            groupManager = new GroupManager();
            // No default groups: users create/join groups as needed
            
            // Initialize position tracker
            positionTracker = new PlayerPositionTracker();
            
            // Initialize and start UDP voice server
            udpServer = new UDPSocketManager(voicePort);
            udpServer.setProximityDistance(proximityDistance);
            udpServer.setPositionTracker(positionTracker);
            
            // Initialize event listener
            eventListener = new PlayerEventListener(positionTracker);
            udpServer.setEventListener(eventListener);
            udpServer.setGroupManager(groupManager);
            
            // Register event system for player join/quit tracking (with udpServer reference for disconnection)
            EntityStore.REGISTRY.registerSystem(new PlayerJoinEventSystem(positionTracker, udpServer));
            EntityStore.REGISTRY.registerSystem(new PlayerMoveEventSystem(positionTracker));
            EntityStore.REGISTRY.registerSystem(new UIRefreshTickingSystem());
            
            udpServer.start();
            
            // Initialize and start WebRTC signaling server
            signalingServer = new WebRTCSignalingServer(NetworkConfig.DEFAULT_SIGNALING_PORT);
            signalingServer.setPositionTracker(positionTracker);
            webRtcAudioBridge = new WebRTCAudioBridge(udpServer, positionTracker, signalingServer.getClientMap());
            webRtcAudioBridge.setProximityDistance(proximityDistance);
            signalingServer.setAudioBridge(webRtcAudioBridge);
            logger.atInfo().log("WebRTC audio bridge wired into signaling server (proximity=" + proximityDistance + ")");
            signalingServer.setClientListener(new WebRTCSignalingServer.WebRTCClientListener() {
                @Override
                public void onClientConnected(java.util.UUID clientId, String username) {
                    logger.atInfo().log("WebRTC client connected: " + username + " (" + clientId + ")");
                    // Trigger UI refresh - web clients now appear in the position tracker
                    if (positionTracker != null) {
                        logger.atInfo().log("Web client added to position tracker for GUI updates");
                    }
                }
                
                @Override
                public void onClientDisconnected(java.util.UUID clientId, String username) {
                    logger.atInfo().log("WebRTC client disconnected: " + username + " (" + clientId + ")");
                    // Position tracker already handles removal
                }
            });
            signalingServer.start();
            
            // Start position tracking
            positionTracker.start();
            
            // Register consolidated voice command
            getCommandRegistry().registerCommand(new VoiceGroupCommand(groupManager, this));
            
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
        
        // Clear any open voice chat pages to prevent stale references
        try {
            com.hytale.voicechat.plugin.gui.VoiceChatPage.clearAllPages();
        } catch (Exception e) {
            logger.atFine().log("Failed to clear voice chat pages: " + e.getMessage());
        }
        
        // Notify clients of graceful shutdown before stopping the UDP server
        if (udpServer != null) {
            try {
                udpServer.broadcastShutdown("Plugin disabled - server shutting down");
                // Allow time for shutdown packets to be delivered before closing the channel
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                logger.atFine().log("Interrupted while waiting for shutdown broadcast");
            } catch (Exception e) {
                logger.atFine().log("Failed to broadcast shutdown: " + e.getMessage());
            }
        }

        if (positionTracker != null) {
            positionTracker.stop();
        }
        
        if (groupManager != null) {
            groupManager.shutdown();
        }
        
        if (udpServer != null) {
            udpServer.stop();
        }
        
        if (signalingServer != null) {
            signalingServer.shutdown();
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
    public void onPlayerMove(UUID playerId, String playerName, double x, double y, double z, double yaw, double pitch, String worldId) {
        if (positionTracker != null) {
            positionTracker.updatePosition(playerId, playerName, x, y, z, yaw, pitch, worldId);
        }
    }
    
    /**
     * Handle player join
     */
    public void onPlayerJoin(UUID playerId, String playerName, double x, double y, double z, double yaw, double pitch, String worldId) {
        if (positionTracker != null) {
            PlayerPosition position = new PlayerPosition(playerId, playerName, x, y, z, yaw, pitch, worldId);
            positionTracker.addPlayer(position);
            logger.atInfo().log("Player joined voice chat: " + playerName + " (" + playerId + ")");
        }
    }
    
    /**
     * Handle player quit - clean up group membership
     */
    public void onPlayerQuit(UUID playerId) {
        if (positionTracker != null) {
            positionTracker.removePlayer(playerId);
        }
        
        if (groupManager != null) {
            groupManager.handlePlayerDisconnect(playerId);
        }
        
        logger.atInfo().log("Player left voice chat: " + playerId);
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
        if (webRtcAudioBridge != null) {
            webRtcAudioBridge.setProximityDistance(this.proximityDistance);
        }
    }

    /**
     * Get current proximity distance (blocks)
     */
    public double getProximityDistance() {
        return proximityDistance;
    }

    /**
     * Get the UDP socket manager
     */
    public UDPSocketManager getUdpServer() {
        return udpServer;
    }

    /**
     * Get the WebRTC signaling server
     */
    public WebRTCSignalingServer getWebRTCServer() {
        return signalingServer;
    }

    /**
     * Get the position tracker
     */
    public PlayerPositionTracker getPositionTracker() {
        return positionTracker;
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
