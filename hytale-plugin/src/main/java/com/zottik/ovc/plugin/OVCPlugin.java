package com.zottik.ovc.plugin;

import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.plugin.JavaPlugin;
import com.hypixel.hytale.server.core.plugin.JavaPluginInit;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import com.zottik.ovc.common.model.PlayerPosition;
import com.zottik.ovc.common.network.NetworkConfig;
import com.zottik.ovc.plugin.command.VoiceGroupCommand;
import com.zottik.ovc.plugin.config.IceServerConfig;
import com.zottik.ovc.plugin.event.PlayerJoinEventSystem;
import com.zottik.ovc.plugin.event.PlayerMoveEventSystem;
import com.zottik.ovc.plugin.event.UIRefreshTickingSystem;
import com.zottik.ovc.plugin.event.VoiceChatHudTickingSystem;
import com.zottik.ovc.plugin.tracker.AuthCodeStore;
import com.zottik.ovc.plugin.tracker.PlayerPositionTracker;
import com.zottik.ovc.plugin.webrtc.DataChannelAudioHandler;
import com.zottik.ovc.plugin.webrtc.WebRTCAudioBridge;
import com.zottik.ovc.plugin.webrtc.WebRTCPeerManager;
import com.zottik.ovc.plugin.webrtc.WebRTCSignalingServer;

import javax.annotation.Nonnull;
import java.nio.file.Path;
import java.util.UUID;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Hytale Plugin for Voice Chat (WebRTC SFU)
 * Tracks player positions and handles WebRTC media routing
 * 
 * This plugin combines position tracking with WebRTC SFU functionality
 * for proximity-based voice chat.
 */
public class OVCPlugin extends JavaPlugin {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static OVCPlugin instance;
    
    private WebRTCSignalingServer signalingServer;
    private WebRTCAudioBridge webRtcAudioBridge;
    private PlayerPositionTracker positionTracker;
    private GroupManager groupManager;
    private AuthCodeStore authCodeStore;
    private double proximityDistance = NetworkConfig.getDefaultProximityDistance();
    private final Set<UUID> hudHidden = ConcurrentHashMap.newKeySet();
    private final Set<UUID> onlinePlayers = ConcurrentHashMap.newKeySet();
    private final ConcurrentHashMap<UUID, ScheduledFuture<?>> pendingDisconnects = new ConcurrentHashMap<>();
    private ScheduledExecutorService disconnectScheduler;

    public OVCPlugin(@Nonnull JavaPluginInit init) {
        super(init);
        instance = this;
        logger.atInfo().log("Obsolete Voice Chat Plugin (WebRTC SFU) initialized - version " + this.getManifest().getVersion());
    }
    
    /**
     * Get the plugin instance
     */
    public static OVCPlugin instance() {
        return instance;
    }

    /**
     * Setup method called when the plugin is enabled
     */
    @Override
    protected void setup() {
        logger.atInfo().log("Setting up Obsolete Voice Chat Plugin (WebRTC SFU)...");
        
        try {
            // Voice configuration is loaded automatically via VoiceConfig static initialization
            // Config file: ovc.conf (or path specified by -Dvoice.config.file)
            logger.atInfo().log("Voice Chat Configuration loaded from: ovc.conf or system properties");
            
            // Get data directory for persistent storage
            Path dataDir = Path.of("plugins", "voicechat");
            
            // Initialize auth code store with file persistence
            authCodeStore = new AuthCodeStore(dataDir);
            logger.atInfo().log("Initialized AuthCodeStore with file persistence");
            
            // Initialize group manager
            groupManager = new GroupManager();
            
            // Initialize position tracker
            positionTracker = new PlayerPositionTracker();

            disconnectScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "VoiceChat-DisconnectGrace");
                t.setDaemon(true);
                return t;
            });
            
            // Register event systems for player tracking
            EntityStore.REGISTRY.registerSystem(new PlayerJoinEventSystem(positionTracker, this));
            EntityStore.REGISTRY.registerSystem(new PlayerMoveEventSystem(positionTracker));
            EntityStore.REGISTRY.registerSystem(new UIRefreshTickingSystem());
            EntityStore.REGISTRY.registerSystem(new VoiceChatHudTickingSystem(this));
            
            // Initialize and start WebRTC signaling server
            signalingServer = new WebRTCSignalingServer(NetworkConfig.getSignalingPort());
            signalingServer.setPositionTracker(positionTracker);
            signalingServer.setPlugin(this);
            
            // Create and set group state manager for group operations
            com.zottik.ovc.plugin.webrtc.GroupStateManager groupStateManager = new com.zottik.ovc.plugin.webrtc.GroupStateManager();
            signalingServer.setGroupStateManager(groupStateManager);
            signalingServer.setGroupManager(groupManager);
            
            webRtcAudioBridge = new WebRTCAudioBridge(positionTracker, signalingServer.getClientMap());
            webRtcAudioBridge.setProximityDistance(proximityDistance);
            webRtcAudioBridge.setGroupManager(groupManager);
            webRtcAudioBridge.setGroupStateManager(groupStateManager);
            signalingServer.setAudioBridge(webRtcAudioBridge);
            DataChannelAudioHandler dataChannelAudioHandler = new DataChannelAudioHandler(webRtcAudioBridge);
            webRtcAudioBridge.setDataChannelAudioHandler(dataChannelAudioHandler);
            webRtcAudioBridge.setClientIdMapper(signalingServer.getClientIdMapper());
            IceServerConfig iceServerConfig = IceServerConfig.defaults();
            WebRTCPeerManager peerManager = new WebRTCPeerManager(
                iceServerConfig.getStunServers(),
                dataChannelAudioHandler
            );
            signalingServer.setPeerManager(peerManager);
            logger.atInfo().log("WebRTC audio bridge initialized (proximity=" + proximityDistance + ")");
            signalingServer.setClientListener(new WebRTCSignalingServer.WebRTCClientListener() {
                @Override
                public void onClientConnected(java.util.UUID clientId, String username) {
                    logger.atInfo().log("WebRTC client connected: " + username + " (" + clientId + ")");
                    if (positionTracker != null && isPlayerOnline(clientId)) {
                        logger.atInfo().log("Web client added to position tracker for GUI updates");
                    } else {
                        logger.atFine().log("Web client pending game session; not added to position tracker yet");
                    }
                }
                
                @Override
                public void onClientDisconnected(java.util.UUID clientId, String username) {
                    logger.atInfo().log("WebRTC client disconnected: " + username + " (" + clientId + ")");
                }
            });
            signalingServer.start();
            
            // Start position tracking
            positionTracker.start();
            
            // Register voice group command
            getCommandRegistry().registerCommand(new VoiceGroupCommand(groupManager, this));
            
            logger.atInfo().log("Obsolete Voice Chat Plugin setup complete - WebSocket signaling on port " + NetworkConfig.getSignalingPort() + " (proximity=" + proximityDistance + ")");
        } catch (Exception e) {
            logger.atSevere().log("Failed to setup Obsolete Voice Chat Plugin: " + e.getMessage());
            e.printStackTrace();
        }
    }
    
    /**
     * Cleanup when plugin is disabled
     */
    @Override
    protected void shutdown() {
        logger.atInfo().log("Shutting down Obsolete Voice Chat Plugin...");
        
        // Clear any open voice chat pages to prevent stale references
        try {
            com.zottik.ovc.plugin.gui.VoiceChatPage.clearAllPages();
        } catch (Exception e) {
            logger.atFine().log("Failed to clear voice chat pages: " + e.getMessage());
        }

        if (positionTracker != null) {
            positionTracker.stop();
        }
        
        if (groupManager != null) {
            groupManager.shutdown();
        }
        
        if (signalingServer != null) {
            signalingServer.shutdown();
        }

        if (disconnectScheduler != null) {
            disconnectScheduler.shutdownNow();
            disconnectScheduler = null;
        }
        pendingDisconnects.clear();
        onlinePlayers.clear();
        
        logger.atInfo().log("Obsolete Voice Chat Plugin shutdown complete");
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
        markPlayerOnline(playerId);
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
        markPlayerOffline(playerId);
        if (positionTracker != null) {
            positionTracker.removePlayer(playerId);
        }
        
        if (groupManager != null) {
            groupManager.handlePlayerDisconnect(playerId);
        }
        
        logger.atInfo().log("Player left voice chat: " + playerId);
    }

    /**
     * Mark a player as online (in-game) and cancel any pending web client disconnect.
     */
    public void markPlayerOnline(UUID playerId) {
        onlinePlayers.add(playerId);
        ScheduledFuture<?> pending = pendingDisconnects.remove(playerId);
        if (pending != null) {
            pending.cancel(false);
        }
        if (signalingServer != null) {
            signalingServer.activatePendingClient(playerId);
        }
    }

    /**
     * Mark a player as offline (left the game) and schedule web client disconnect.
     */
    public void markPlayerOffline(UUID playerId) {
        onlinePlayers.remove(playerId);
        scheduleDisconnectAfterGrace(playerId);
    }

    /**
     * Check if a player is currently online in-game.
     */
    public boolean isPlayerOnline(UUID playerId) {
        return onlinePlayers.contains(playerId);
    }

    private void scheduleDisconnectAfterGrace(UUID playerId) {
        if (signalingServer == null || disconnectScheduler == null) {
            return;
        }
        ScheduledFuture<?> existing = pendingDisconnects.remove(playerId);
        if (existing != null) {
            existing.cancel(false);
        }

        int graceSeconds = NetworkConfig.getGameQuitGraceSeconds();
        Runnable task = () -> {
            pendingDisconnects.remove(playerId);
            if (!isPlayerOnline(playerId) && signalingServer != null) {
                signalingServer.disconnectClient(playerId, "Game session ended", 4001);
            }
        };

        if (graceSeconds <= 0) {
            task.run();
            return;
        }

        ScheduledFuture<?> future = disconnectScheduler.schedule(task, graceSeconds, TimeUnit.SECONDS);
        pendingDisconnects.put(playerId, future);
    }

    /**
     * Configure proximity distance (blocks)
     */
    public void configureProximity(double proximityDistance) {
        this.proximityDistance = Math.max(1.0, Math.min(proximityDistance, NetworkConfig.MAX_VOICE_DISTANCE));
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
    
    /**
     * Get the auth code store
     */
    public AuthCodeStore getAuthCodeStore() {
        return authCodeStore;
    }

    /**
     * Check if the mic HUD is hidden for a player.
     */
    public boolean isHudHidden(UUID playerId) {
        return hudHidden.contains(playerId);
    }

    /**
     * Set whether the mic HUD is hidden for a player.
     */
    public void setHudHidden(UUID playerId, boolean hidden) {
        if (hidden) {
            hudHidden.add(playerId);
        } else {
            hudHidden.remove(playerId);
        }
    }

    /**
     * Toggle the mic HUD hidden state.
     *
     * @return true if hidden after toggle, false if shown.
     */
    public boolean toggleHudHidden(UUID playerId) {
        if (hudHidden.contains(playerId)) {
            hudHidden.remove(playerId);
            return false;
        }
        hudHidden.add(playerId);
        return true;
    }

}
