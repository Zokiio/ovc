package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.zottik.ovc.common.model.Group;
import com.zottik.ovc.common.model.GroupSettings;
import com.zottik.ovc.common.model.PlayerPosition;
import com.zottik.ovc.common.network.NetworkConfig;
import com.zottik.ovc.common.signaling.SignalingMessage;
import com.zottik.ovc.plugin.GroupManager;
import com.zottik.ovc.plugin.OVCPlugin;
import com.zottik.ovc.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.entity.entities.Player;
import com.hypixel.hytale.server.core.permissions.PermissionsModule;
import com.hypixel.hytale.server.core.universe.world.storage.EntityStore;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.*;
import io.netty.channel.MultiThreadIoEventLoopGroup;
import io.netty.channel.nio.NioIoHandler;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.*;
import io.netty.handler.codec.http.websocketx.*;
import io.netty.handler.ssl.SslContext;
import io.netty.handler.ssl.SslContextBuilder;
import io.netty.handler.ssl.util.SelfSignedCertificate;
import io.netty.util.AttributeKey;

import javax.net.ssl.SSLException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.security.cert.CertificateException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * WebSocket server for WebRTC signaling between web clients and server
 */
public class WebRTCSignalingServer implements GroupManager.GroupEventListener {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final AttributeKey<WebRTCClient> CLIENT_ATTR = AttributeKey.valueOf("webrtc_client");
    private static final long HEARTBEAT_INTERVAL_MS = 15000L;
    private static final long HEARTBEAT_TIMEOUT_MS = 45000L;
    private static final long RESUME_WINDOW_MS = 30000L;
    
    private final int port;
    private final Map<UUID, WebRTCClient> clients;
    private final Map<String, ResumableSession> resumableSessions = new ConcurrentHashMap<>();
    private final ScheduledExecutorService heartbeatScheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "webrtc-heartbeat-monitor");
        t.setDaemon(true);
        return t;
    });
    private final ClientIdMapper clientIdMapper;
    private PlayerPositionTracker positionTracker;
    private WebRTCAudioBridge audioBridge;
    private WebRTCPeerManager peerManager;
    private WebRTCClientListener clientListener;
    private GroupStateManager groupStateManager;
    private GroupManager groupManager;
    private OVCPlugin plugin;
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;
    private SslContext sslContext;
    private java.util.concurrent.ScheduledExecutorService positionBroadcastScheduler;
    private java.util.concurrent.ScheduledExecutorService pendingAuthScheduler;
    private final java.util.concurrent.ConcurrentHashMap<UUID, java.util.concurrent.ScheduledFuture<?>> pendingAuthDisconnects = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.Set<String> allowedOrigins;
    
    /**
     * Check if an origin is allowed to connect
     */
    private boolean isOriginAllowed(String origin) {
        if (origin == null || origin.isEmpty()) {
            return false;
        }
        // Allow exact matches or wildcard for local development
        return allowedOrigins.contains(origin) || allowedOrigins.contains("*");
    }
    
    /**
     * Listener interface for web client connection/disconnection events
     */
    public interface WebRTCClientListener {
        void onClientConnected(UUID clientId, String username);
        void onClientDisconnected(UUID clientId, String username);
    }
    
    public WebRTCSignalingServer() {
        this(NetworkConfig.getSignalingPort());
    }
    
    public WebRTCSignalingServer(int port) {
        this.port = port;
        this.clients = new ConcurrentHashMap<>();
        this.groupStateManager = new GroupStateManager();
        this.clientIdMapper = new ClientIdMapper();
        
        // Parse allowed origins from configuration
        this.allowedOrigins = new java.util.HashSet<>();
        String originsConfig = NetworkConfig.getAllowedOrigins();
        if (originsConfig != null && !originsConfig.isEmpty()) {
            String[] origins = originsConfig.split(",");
            for (String origin : origins) {
                allowedOrigins.add(origin.trim());
            }
        }
        logger.atInfo().log("Allowed origins for WebSocket connections: " + allowedOrigins);
        startHeartbeatMonitor();
    }
    
    public void setPlugin(OVCPlugin plugin) {
        this.plugin = plugin;
        logger.atInfo().log("Plugin reference set for auth validation");
    }
    
    public void setPositionTracker(PlayerPositionTracker tracker) {
        this.positionTracker = tracker;
    }
    
    public void setGroupManager(GroupManager groupManager) {
        this.groupManager = groupManager;
        // Register as event listener to receive group change notifications
        groupManager.registerGroupEventListener(this);
        logger.atInfo().log("Group manager set for WebRTC signaling server with event listener");
    }
    
    public void setGroupStateManager(GroupStateManager stateManager) {
        this.groupStateManager = stateManager;
    }
    
    public void setAudioBridge(WebRTCAudioBridge bridge) {
        this.audioBridge = bridge;
        logger.atInfo().log("Audio bridge set for WebRTC signaling server");
    }

    public void setPeerManager(WebRTCPeerManager peerManager) {
        this.peerManager = peerManager;
        if (this.peerManager != null) {
            this.peerManager.setIceCandidateListener(new WebRTCPeerManager.IceCandidateListener() {
                @Override
                public void onLocalCandidate(UUID clientId, String candidate, String sdpMid, int sdpMLineIndex) {
                    sendIceCandidateToClient(clientId, candidate, sdpMid, sdpMLineIndex);
                }

                @Override
                public void onIceGatheringComplete(UUID clientId) {
                    sendIceCandidateCompleteToClient(clientId);
                }
            });
        }
        logger.atInfo().log("WebRTC peer manager set");
    }

    public ClientIdMapper getClientIdMapper() {
        return clientIdMapper;
    }
    
    public void setClientListener(WebRTCClientListener listener) {
        this.clientListener = listener;
        logger.atInfo().log("WebRTC client listener set");
    }
    
    public void start() throws InterruptedException, CertificateException, SSLException {
        bossGroup = new MultiThreadIoEventLoopGroup(1, NioIoHandler.newFactory());
        workerGroup = new MultiThreadIoEventLoopGroup(NioIoHandler.newFactory());
        
        try {
            // Create SSL context if enabled in configuration
            if (NetworkConfig.isSSLEnabled()) {
                this.sslContext = createSSLContext();
                logger.atInfo().log("SSL enabled - WebSocket will use wss:// protocol");
            } else {
                this.sslContext = null;
                logger.atInfo().log("SSL disabled - WebSocket will use ws:// protocol (development mode)");
            }
            
            ServerBootstrap bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup)
                    .channel(NioServerSocketChannel.class)
                    .childHandler(new ChannelInitializer<SocketChannel>() {
                        @Override
                        protected void initChannel(SocketChannel ch) {
                            ChannelPipeline pipeline = ch.pipeline();
                            
                            // Add SSL handler for wss:// support (only if enabled)
                            if (sslContext != null) {
                                pipeline.addLast(sslContext.newHandler(ch.alloc()));
                            }
                            
                            pipeline.addLast(new HttpServerCodec());
                            pipeline.addLast(new HttpObjectAggregator(65536));
                            pipeline.addLast(new WebSocketServerHandler());
                        }
                    });
            
            String protocol = NetworkConfig.isSSLEnabled() ? "wss://" : "ws://";
            serverChannel = bootstrap.bind(port).sync().channel();
            logger.atInfo().log("WebRTC signaling server started on port " + port + " (" + protocol + " protocol)");
            
            // Start audio bridge if available
            if (audioBridge != null && !audioBridge.isRunning()) {
                logger.atInfo().log("Starting WebRTC audio bridge");
                audioBridge.start();
            } else if (audioBridge == null) {
                logger.atWarning().log("WebRTC audio bridge is not set; audio routing disabled");
            }
            
            // Start position broadcast scheduler
            startPositionBroadcaster();

            if (pendingAuthScheduler == null) {
                pendingAuthScheduler = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
                    Thread t = new Thread(r, "PendingAuthScheduler");
                    t.setDaemon(true);
                    return t;
                });
            }
        } catch (Exception e) {
            logger.atSevere().log("Failed to start WebRTC signaling server", e);
            shutdown();
            throw e;
        }
    }
    
    /**
     * Create an SSL context with Let's Encrypt certificate or self-signed fallback
     */
    private SslContext createSSLContext() throws CertificateException, SSLException {
        try {
            // Try to load certificate from file system first (Let's Encrypt or custom)
            java.io.File certFile = new java.io.File(NetworkConfig.getSSLCertPath());
            java.io.File keyFile = new java.io.File(NetworkConfig.getSSLKeyPath());
            
            if (certFile.exists() && keyFile.exists()) {
                logger.atInfo().log("Loading SSL certificate from: " + NetworkConfig.getSSLCertPath());
                SslContext context = SslContextBuilder
                        .forServer(certFile, keyFile)
                        .build();
                logger.atInfo().log("SSL context created successfully with certificate from file system");
                return context;
            } else {
                // Fall back to self-signed certificate for development
                logger.atWarning().log("Certificate files not found at " + NetworkConfig.getSSLCertPath() + ", using self-signed certificate");
                logger.atInfo().log("For production, ensure Let's Encrypt certificates are accessible");
                SelfSignedCertificate ssc = new SelfSignedCertificate();
                SslContext context = SslContextBuilder
                        .forServer(ssc.certificate(), ssc.privateKey())
                        .build();
                logger.atInfo().log("SSL context created with self-signed certificate");
                return context;
            }
        } catch (CertificateException e) {
            logger.atSevere().log("Failed to create SSL context", e);
            throw e;
        } catch (Exception e) {
            logger.atSevere().log("Unexpected error creating SSL context", e);
            throw new SSLException("Failed to create SSL context", e);
        }
    }

    private String generateSessionId() {
        return UUID.randomUUID().toString();
    }

    private String generateResumeToken() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private void startHeartbeatMonitor() {
        heartbeatScheduler.scheduleAtFixedRate(() -> {
            long now = System.currentTimeMillis();
            for (WebRTCClient client : clients.values()) {
                if (client == null || !client.isConnected()) {
                    continue;
                }
                long lastHeartbeat = client.getLastHeartbeatAt();
                if (lastHeartbeat > 0 && now - lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
                    logger.atInfo().log("Heartbeat timeout for client " + client.getClientId());
                    disconnectClient(client.getClientId(), "Heartbeat timeout", 4000);
                }
            }

            for (var entry : resumableSessions.entrySet()) {
                ResumableSession session = entry.getValue();
                if (session.expiresAt < now) {
                    resumableSessions.remove(entry.getKey());
                    clientIdMapper.removeMapping(session.clientId);
                }
            }
        }, HEARTBEAT_INTERVAL_MS, HEARTBEAT_INTERVAL_MS, TimeUnit.MILLISECONDS);
    }
    
    public void shutdown() {
        logger.atInfo().log("Shutting down WebRTC signaling server");
        
        // Stop position broadcaster
        if (positionBroadcastScheduler != null) {
            positionBroadcastScheduler.shutdownNow();
            positionBroadcastScheduler = null;
        }

        if (pendingAuthScheduler != null) {
            pendingAuthScheduler.shutdownNow();
            pendingAuthScheduler = null;
        }
        pendingAuthDisconnects.clear();
        heartbeatScheduler.shutdownNow();
        
        // Shutdown audio bridge first
        if (audioBridge != null && audioBridge.isRunning()) {
            audioBridge.shutdown();
        }
        
        // Disconnect all clients and remove from position tracker
        clients.values().forEach(client -> {
            try {
                if (positionTracker != null) {
                    positionTracker.removePlayer(client.getClientId());
                }
                cancelPendingAuthDisconnect(client.getClientId());
                client.disconnect();
            } catch (Exception e) {
                logger.atWarning().log("Error disconnecting client: " + e.getMessage());
            }
        });
        clients.clear();
        
        // Clear obfuscated ID mappings
        clientIdMapper.clear();
        
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
        }
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
        }
    }
    
    /**
     * Check if a web client is connected by client ID
     */
    public boolean isWebClientConnected(java.util.UUID clientId) {
        WebRTCClient client = clients.get(clientId);
        return client != null && client.isConnected();
    }

    /**
     * Disconnect a web client with a close reason and code.
     */
    public void disconnectClient(UUID clientId, String reason, int closeCode) {
        WebRTCClient client = clients.get(clientId);
        if (client == null) {
            return;
        }

        Channel channel = client.getChannel();
        if (channel != null && channel.isActive()) {
            try {
                channel.writeAndFlush(new CloseWebSocketFrame(closeCode, reason));
            } catch (Exception e) {
                logger.atWarning().log("Failed to send close frame to client " + clientId + ": " + e.getMessage());
            }
        }

        cleanupClient(client, true);
    }

    /**
     * Check if a web client's microphone is muted
     */
    public boolean isWebClientMuted(java.util.UUID clientId) {
        WebRTCClient client = clients.get(clientId);
        return client != null && client.isMuted();
    }

    /**
     * Set a client's microphone mute state and optionally notify the client.
     */
    public boolean setClientMuted(java.util.UUID clientId, boolean muted, boolean notifyClient) {
        WebRTCClient client = clients.get(clientId);
        if (client == null || !client.isConnected()) {
            return false;
        }

        client.setMuted(muted);

        if (notifyClient) {
            JsonObject data = new JsonObject();
            data.addProperty("isMuted", muted);
            SignalingMessage message = new SignalingMessage(SignalingMessage.TYPE_SET_MIC_MUTE, data);
            client.sendMessage(message.toJson());
        }

        broadcastMuteStatus(client, muted);
        return true;
    }

    private void broadcastMuteStatus(WebRTCClient client, boolean isMuted) {
        if (groupStateManager == null || client == null) {
            return;
        }
        UUID groupId = groupStateManager.getClientGroup(client.getClientId());
        if (groupId == null) {
            return;
        }
        JsonObject broadcastData = new JsonObject();
        broadcastData.addProperty("userId", clientIdMapper.getObfuscatedId(client.getClientId()));
        broadcastData.addProperty("username", client.getUsername());
        // Note: "isMuted" represents microphone mute status (not speaker/output mute)
        // Clients map this to "isMicMuted" to distinguish from local speaker mute
        broadcastData.addProperty("isMuted", isMuted);
        SignalingMessage broadcastMsg = new SignalingMessage("user_mute_status", broadcastData);
        groupStateManager.broadcastToGroupAll(groupId, broadcastMsg);
    }
    
    /**
     * Get all connected web clients
     */
    public Map<java.util.UUID, WebRTCClient> getConnectedClients() {
        return new ConcurrentHashMap<>(clients);
    }

    /**
     * Get the live WebRTC client map (for routing/bridge usage)
     */
    public Map<java.util.UUID, WebRTCClient> getClientMap() {
        return clients;
    }
    
    // ========== GroupEventListener Implementation ==========
    
    /**
     * Broadcast group creation to all connected web clients
     */
    @Override
    public void onGroupCreated(Group group, UUID creatorId) {
        logger.atFine().log("Broadcasting group_created event: " + group.getName());
        
        JsonObject broadcastData = new JsonObject();
        broadcastData.addProperty("groupId", group.getGroupId().toString());
        broadcastData.addProperty("groupName", group.getName());
        broadcastData.addProperty("memberCount", group.getMemberCount());
        broadcastData.addProperty("membersCount", group.getMemberCount()); // Backward compatibility
        broadcastData.addProperty("maxMembers", group.getSettings().getMaxMembers());
        broadcastData.addProperty("proximityRange", group.getSettings().getProximityRange());
        broadcastData.addProperty("isIsolated", group.isIsolated());
        broadcastData.addProperty("creatorClientId", clientIdMapper.getObfuscatedId(creatorId));
        
        SignalingMessage broadcastMsg = new SignalingMessage("group_created", broadcastData);
        broadcastToAll(broadcastMsg);
    }
    
    /**
     * Broadcast player joining a group to all connected web clients
     */
    @Override
    public void onPlayerJoinedGroup(UUID playerId, Group group) {
        logger.atFine().log("Broadcasting player joined group: " + playerId + " joined " + group.getName());

        WebRTCClient joiningClient = clients.get(playerId);
        if (joiningClient != null && joiningClient.isConnected()) {
            groupStateManager.addClientToGroup(playerId, joiningClient, group.getGroupId());
        }

        broadcastGroupList();
        broadcastPlayerList();
    }
    
    /**
     * Broadcast player leaving a group to all connected web clients
     */
    @Override
    public void onPlayerLeftGroup(UUID playerId, Group group, boolean groupDeleted) {
        logger.atFine().log("Broadcasting player left group: " + playerId + " left " + group.getName());
        
        UUID groupId = group.getGroupId();
        groupStateManager.removeClientFromAllGroups(playerId);
        
        // Send group_left to the leaving player's web client if connected
        WebRTCClient leavingClient = clients.get(playerId);
        if (leavingClient != null && leavingClient.isConnected()) {
            // Send group_left message
            JsonObject leftData = new JsonObject();
            leftData.addProperty("groupId", groupId.toString());
            leftData.addProperty("memberCount", group.getMemberCount());
            SignalingMessage leftMsg = new SignalingMessage("group_left", leftData);
            leavingClient.sendMessage(leftMsg.toJson());
            
            logger.atFine().log("Sent group_left to web client: " + leavingClient.getUsername());
        }
        
        // Broadcast updated member list to remaining group members
        if (!groupDeleted) {
            com.google.gson.JsonArray membersArray = groupStateManager.getGroupMembersJson(groupId, clients, clientIdMapper);
            JsonObject broadcastData = SignalingPayloadFactory.buildGroupMembersUpdateData(
                groupId,
                group.getName(),
                membersArray
            );

            SignalingMessage membersMsg = new SignalingMessage("group_members_updated", broadcastData);
            groupStateManager.broadcastToGroupAll(groupId, membersMsg);
        }
        
        // Also refresh full group list for all clients
        broadcastGroupList();
        broadcastPlayerList();
    }
    
    /**
     * Broadcast group deletion to all connected web clients
     */
    @Override
    public void onGroupDeleted(Group group) {
        logger.atFine().log("Broadcasting group deleted: " + group.getName());
        broadcastGroupList(); // Refresh the full list
    }
    
    /**
     * Broadcast a message to all connected web clients
     */
    private void broadcastToAll(SignalingMessage message) {
        for (WebRTCClient client : clients.values()) {
            if (client != null && client.isConnected()) {
                client.sendMessage(message.toJson());
            }
        }
    }
    
    /**
     * Broadcast current group list to all connected web clients
     */
    private void broadcastGroupList() {
        if (groupManager == null) {
            return;
        }
        JsonObject data = SignalingPayloadFactory.buildGroupListData(
            groupManager.listGroups(),
            groupStateManager,
            clients,
            clientIdMapper,
            SignalingPayloadFactory.GroupListMode.BROADCAST
        );

        SignalingMessage message = new SignalingMessage("group_list", data);
        broadcastToAll(message);
    }
    
    /**
     * Broadcast current player list to all connected web clients
     */
    private void broadcastPlayerList() {
        JsonObject data = SignalingPayloadFactory.buildPlayerListData(
            clients.values(),
            groupStateManager,
            clientIdMapper
        );

        SignalingMessage message = new SignalingMessage("player_list", data);
        broadcastToAll(message);
    }

    private boolean shouldRemoveFromPositionTracker(UUID clientId) {
        if (plugin == null) {
            return true;
        }
        return !plugin.isPlayerOnline(clientId);
    }

    private void cleanupClient(WebRTCClient client, boolean removeFromPositionTracker) {
        if (client == null) {
            return;
        }

        UUID clientId = client.getClientId();
        WebRTCClient existing = clients.get(clientId);
        if (existing == null) {
            return;
        }
        if (existing != client) {
            logger.atInfo().log("Skipping cleanup for stale connection of client " + clientId);
            return;
        }
        clients.remove(clientId);

        cancelPendingAuthDisconnect(clientId);

        UUID lastGroupId = null;
        if (groupStateManager != null) {
            lastGroupId = groupStateManager.getClientGroup(clientId);
        }

        // Remove from authoritative group membership BEFORE clearing state manager
        // so that auto-disband and event broadcasts work correctly
        if (groupManager != null) {
            groupManager.leaveGroup(clientId);
        }

        if (groupStateManager != null) {
            groupStateManager.removeClientFromAllGroups(clientId);
        }

        // Notify listener of client disconnection
        if (clientListener != null) {
            clientListener.onClientDisconnected(clientId, existing.getUsername());
        }

        // Close peer connection if present
        if (peerManager != null) {
            peerManager.closePeerConnection(clientId);
        }

        // Remove from position tracker only if player is offline
        if (removeFromPositionTracker && positionTracker != null) {
            positionTracker.removePlayer(clientId);
            logger.atInfo().log("Removed WebRTC client from position tracker: " + clientId);
        }

        boolean allowResume = client.getResumeToken() != null && !client.getResumeToken().isEmpty();
        if (allowResume) {
            resumableSessions.put(client.getResumeToken(), new ResumableSession(
                clientId,
                client.getUsername(),
                client.getSessionId(),
                client.getResumeToken(),
                lastGroupId,
                client.getNegotiatedAudioCodec(),
                System.currentTimeMillis() + RESUME_WINDOW_MS
            ));
        } else {
            clientIdMapper.removeMapping(clientId);
        }

        logger.atInfo().log("WebRTC client disconnected: " + clientId);

        // Broadcast updated player list to all remaining clients
        broadcastPlayerList();
    }

    private void sendPendingStatus(ChannelHandlerContext ctx, WebRTCClient client) {
        JsonObject data = new JsonObject();
        int timeoutSeconds = NetworkConfig.getPendingGameJoinTimeoutSeconds();
        String messageText = timeoutSeconds > 0
                ? "Waiting for game session... disconnecting in " + timeoutSeconds + "s."
                : "Waiting for game session...";
        data.addProperty("message", messageText);
        data.addProperty("timeoutSeconds", timeoutSeconds);
        SignalingMessage message = new SignalingMessage("pending_game_session", data);
        ctx.channel().writeAndFlush(new TextWebSocketFrame(message.toJson()));
    }

    private void sendErrorToClient(WebRTCClient client, String error) {
        if (client == null) {
            return;
        }
        JsonObject errorData = new JsonObject();
        errorData.addProperty("message", error);
        SignalingMessage errorMessage = new SignalingMessage(SignalingMessage.TYPE_ERROR, errorData);
        client.sendMessage(errorMessage.toJson());
    }

    private void sendIceCandidateToClient(UUID clientId, String candidate, String sdpMid, int sdpMLineIndex) {
        WebRTCClient client = clients.get(clientId);
        if (client == null) {
            return;
        }
        if ((sdpMid == null || sdpMid.isEmpty()) && sdpMLineIndex < 0) {
            logger.atFine().log("Skipping ICE candidate without sdpMid/mLineIndex for client " + clientId);
            return;
        }

        JsonObject data = new JsonObject();
        data.addProperty("candidate", candidate);
        if (sdpMid != null) {
            data.addProperty("sdpMid", sdpMid);
        }
        if (sdpMLineIndex >= 0) {
            data.addProperty("sdpMLineIndex", sdpMLineIndex);
        }

        SignalingMessage message = new SignalingMessage(SignalingMessage.TYPE_ICE_CANDIDATE, data);
        client.sendMessage(message.toJson());
    }

    private void sendIceCandidateCompleteToClient(UUID clientId) {
        WebRTCClient client = clients.get(clientId);
        if (client == null) {
            return;
        }

        JsonObject data = new JsonObject();
        data.addProperty("complete", true);
        SignalingMessage message = new SignalingMessage(SignalingMessage.TYPE_ICE_CANDIDATE, data);
        client.sendMessage(message.toJson());
    }

    private void schedulePendingAuthDisconnect(UUID clientId) {
        if (pendingAuthScheduler == null) {
            return;
        }
        int timeoutSeconds = NetworkConfig.getPendingGameJoinTimeoutSeconds();
        if (timeoutSeconds <= 0) {
            return;
        }

        java.util.concurrent.ScheduledFuture<?> existing = pendingAuthDisconnects.remove(clientId);
        if (existing != null) {
            existing.cancel(false);
        }

        java.util.concurrent.ScheduledFuture<?> future = pendingAuthScheduler.schedule(() -> {
            pendingAuthDisconnects.remove(clientId);
            WebRTCClient client = clients.get(clientId);
            if (client != null && client.isPendingGameSession()) {
                sendErrorToClient(client, "Game session not found. Please join the game to continue.");
                disconnectClient(clientId, "Game session not found", 4002);
            }
        }, timeoutSeconds, java.util.concurrent.TimeUnit.SECONDS);
        pendingAuthDisconnects.put(clientId, future);
    }

    private void cancelPendingAuthDisconnect(UUID clientId) {
        java.util.concurrent.ScheduledFuture<?> existing = pendingAuthDisconnects.remove(clientId);
        if (existing != null) {
            existing.cancel(false);
        }
    }

    /**
     * Promote a pending client when their game session becomes available.
     */
    public void activatePendingClient(UUID clientId) {
        WebRTCClient client = clients.get(clientId);
        if (client == null || !client.isPendingGameSession()) {
            return;
        }

        client.setPendingGameSession(false);
        cancelPendingAuthDisconnect(clientId);

        JsonObject data = new JsonObject();
        data.addProperty("message", "Game session ready");
        SignalingMessage message = new SignalingMessage("game_session_ready", data);
        client.sendMessage(message.toJson());

        broadcastPlayerList();
    }
    
    /**
     * Start the periodic position broadcaster
     */
    private void startPositionBroadcaster() {
        if (positionBroadcastScheduler != null) {
            return;
        }
        
        positionBroadcastScheduler = java.util.concurrent.Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "PositionBroadcaster");
            t.setDaemon(true);
            return t;
        });
        
        long intervalMs = NetworkConfig.getPositionBroadcastIntervalMs();
        positionBroadcastScheduler.scheduleAtFixedRate(
            this::broadcastPositions,
            intervalMs,
            intervalMs,
            java.util.concurrent.TimeUnit.MILLISECONDS
        );
        
        logger.atInfo().log("Position broadcaster started (interval: " + intervalMs + "ms)");
    }
    
    /**
     * Broadcast player positions to connected web clients.
     * Only sends positions of users within the viewer's proximity range.
     * Uses obfuscated IDs instead of real UUIDs.
     */
    private void broadcastPositions() {
        if (positionTracker == null || clients.isEmpty()) {
            return;
        }
        
        try {
            Map<UUID, PlayerPosition> allPositions = positionTracker.getPlayerPositions();
            if (allPositions.isEmpty()) {
                return;
            }
            
            // Per-client filtering by proximity
            for (WebRTCClient client : clients.values()) {
                if (!client.isConnected()) continue;
                
                PlayerPosition viewerPos = allPositions.get(client.getClientId());
                if (viewerPos == null) continue;
                
                // Get proximity range from group settings or use configurable default
                double proximityRange = NetworkConfig.getDefaultProximityDistance();
                UUID groupId = groupStateManager.getClientGroup(client.getClientId());
                if (groupId != null && groupManager != null) {
                    Group group = groupManager.getGroup(groupId);
                    if (group != null) {
                        proximityRange = group.getSettings().getProximityRange();
                    }
                }
                
                com.google.gson.JsonArray positionsArray = new com.google.gson.JsonArray();
                for (PlayerPosition pos : allPositions.values()) {
                    // Skip self
                    if (pos.getPlayerId().equals(client.getClientId())) continue;
                    
                    // Check proximity
                    double distance = viewerPos.distanceTo(pos);
                    if (distance <= proximityRange && distance != Double.MAX_VALUE) {
                        JsonObject posObj = new JsonObject();
                        // Use obfuscated ID instead of real UUID
                        posObj.addProperty("userId", clientIdMapper.getObfuscatedId(pos.getPlayerId()));
                        posObj.addProperty("username", pos.getPlayerName());
                        posObj.addProperty("x", pos.getX());
                        posObj.addProperty("y", pos.getY());
                        posObj.addProperty("z", pos.getZ());
                        posObj.addProperty("yaw", pos.getYaw());
                        posObj.addProperty("pitch", pos.getPitch());
                        posObj.addProperty("worldId", pos.getWorldId());
                        posObj.addProperty("distance", Math.round(distance * 10.0) / 10.0); // Round to 1 decimal
                        positionsArray.add(posObj);
                    }
                }
                
                // Only send if there are nearby positions
                if (positionsArray.size() > 0) {
                    JsonObject data = new JsonObject();
                    data.add("positions", positionsArray);
                    JsonObject listenerObj = new JsonObject();
                    listenerObj.addProperty("userId", clientIdMapper.getObfuscatedId(client.getClientId()));
                    listenerObj.addProperty("x", viewerPos.getX());
                    listenerObj.addProperty("y", viewerPos.getY());
                    listenerObj.addProperty("z", viewerPos.getZ());
                    listenerObj.addProperty("yaw", viewerPos.getYaw());
                    listenerObj.addProperty("pitch", viewerPos.getPitch());
                    listenerObj.addProperty("worldId", viewerPos.getWorldId());
                    data.add("listener", listenerObj);
                    data.addProperty("timestamp", System.currentTimeMillis());
                    
                    SignalingMessage message = new SignalingMessage("position_update", data);
                    client.sendMessage(message.toJson());
                }
            }
        } catch (Exception e) {
            logger.atWarning().log("Error broadcasting positions: " + e.getMessage());
        }
    }
    
    private class WebSocketServerHandler extends SimpleChannelInboundHandler<Object> {
        private WebSocketServerHandshaker handshaker;
        private final SignalingClientSessionService clientSessionService =
                new SignalingClientSessionService(CLIENT_ATTR, this::sendMessage);
        private final SignalingWebRtcService webRtcService =
                new SignalingWebRtcService(CLIENT_ATTR, () -> peerManager, this::sendMessage, this::sendError);
        private final SignalingGroupService groupService =
                new SignalingGroupService(() -> groupManager, () -> groupStateManager, clients, clientIdMapper, this::sendMessage, this::sendError);
        
        @Override
        protected void channelRead0(ChannelHandlerContext ctx, Object msg) {
            if (msg instanceof FullHttpRequest) {
                handleHttpRequest(ctx, (FullHttpRequest) msg);
            } else if (msg instanceof WebSocketFrame) {
                handleWebSocketFrame(ctx, (WebSocketFrame) msg);
            }
        }
        
        private void handleHttpRequest(ChannelHandlerContext ctx, FullHttpRequest req) {
            // Handle WebSocket upgrade
            if (!req.decoderResult().isSuccess()) {
                sendHttpResponse(ctx, req, new DefaultFullHttpResponse(
                        req.protocolVersion(), HttpResponseStatus.BAD_REQUEST));
                return;
            }
            
            // Validate origin for security (prevent cross-site WebSocket hijacking)
            String origin = req.headers().get(HttpHeaderNames.ORIGIN);
            if (!isOriginAllowed(origin)) {
                logger.atWarning().log("Rejected WebSocket connection from unauthorized origin: " + origin);
                sendHttpResponse(ctx, req, new DefaultFullHttpResponse(
                        req.protocolVersion(), HttpResponseStatus.FORBIDDEN));
                return;
            }
            logger.atFine().log("Accepting WebSocket connection from origin: " + origin);
            
            // WebSocket handshake
            WebSocketServerHandshakerFactory wsFactory = new WebSocketServerHandshakerFactory(
                    getWebSocketLocation(req), null, true);
            handshaker = wsFactory.newHandshaker(req);
            
            if (handshaker == null) {
                WebSocketServerHandshakerFactory.sendUnsupportedVersionResponse(ctx.channel());
            } else {
                handshaker.handshake(ctx.channel(), req);
                logger.atFine().log("WebSocket handshake completed for " + ctx.channel().remoteAddress());
            }
        }
        
        private void handleWebSocketFrame(ChannelHandlerContext ctx, WebSocketFrame frame) {
            if (frame instanceof CloseWebSocketFrame) {
                handshaker.close(ctx.channel(), (CloseWebSocketFrame) frame.retain());
                handleDisconnect(ctx);
                return;
            }
            
            if (frame instanceof PingWebSocketFrame) {
                ctx.channel().write(new PongWebSocketFrame(frame.content().retain()));
                return;
            }
            
            if (!(frame instanceof TextWebSocketFrame)) {
                throw new UnsupportedOperationException(
                        String.format("%s frame types not supported", frame.getClass().getName()));
            }
            
            String message = ((TextWebSocketFrame) frame).text();
            handleSignalingMessage(ctx, message);
        }
        
        private void handleSignalingMessage(ChannelHandlerContext ctx, String json) {
            try {
                SignalingMessage message = SignalingMessage.fromJson(json);
                logger.atFine().log("Received signaling message: " + message.getType());

                if (!SignalingMessage.TYPE_AUTHENTICATE.equals(message.getType())) {
                    WebRTCClient pendingClient = ctx.channel().attr(CLIENT_ATTR).get();
                    if (pendingClient != null && pendingClient.isPendingGameSession()) {
                        if (!SignalingMessage.TYPE_DISCONNECT.equals(message.getType())
                                && !"ping".equals(message.getType())
                                && !SignalingMessage.TYPE_HEARTBEAT.equals(message.getType())) {
                            sendPendingStatus(ctx, pendingClient);
                            return;
                        }
                    }
                }
                
                switch (message.getType()) {
                    case SignalingMessage.TYPE_AUTHENTICATE:
                        handleAuthenticate(ctx, message);
                        break;
                    case SignalingMessage.TYPE_RESUME:
                        handleResume(ctx, message);
                        break;
                    case "create_group":
                        handleCreateGroup(ctx, message);
                        break;
                    case "join_group":
                        handleJoinGroup(ctx, message);
                        break;
                    case "leave_group":
                        handleLeaveGroup(ctx, message);
                        break;
                    case "list_groups":
                        groupService.handleListGroups(ctx);
                        break;
                    case "list_players":
                        groupService.handleListPlayers(ctx);
                        break;
                    case "get_group_members":
                        groupService.handleGetGroupMembers(ctx, message);
                        break;
                    case "update_group_password":
                        handleUpdateGroupPassword(ctx, message);
                        break;
                    case "set_group_permanent":
                        handleSetGroupPermanent(ctx, message);
                        break;
                    case "user_speaking":
                        handleUserSpeakingStatus(ctx, message);
                        break;
                    case "user_mute":
                        handleUserMuteStatus(ctx, message);
                        break;
                    case "ping":
                        handlePing(ctx, message);
                        break;
                    case SignalingMessage.TYPE_HEARTBEAT:
                        clientSessionService.handleHeartbeat(ctx, message);
                        break;
                    case "audio":
                        sendError(ctx, "WebSocket audio transport is no longer supported; use WebRTC DataChannel");
                        break;
                    case "start_datachannel":
                        webRtcService.handleStartDataChannel(ctx);
                        break;
                    case SignalingMessage.TYPE_DISCONNECT:
                        handleDisconnect(ctx);
                        break;
                    case SignalingMessage.TYPE_OFFER:
                        webRtcService.handleOffer(ctx, message);
                        break;
                    case SignalingMessage.TYPE_ICE_CANDIDATE:
                        webRtcService.handleIceCandidate(ctx, message);
                        break;
                    default:
                        logger.atWarning().log("Unknown signaling message type: " + message.getType());
                }
            } catch (Exception e) {
                logger.atSevere().log("Error handling signaling message", e);
                sendError(ctx, "Invalid message format");
            }
        }

        private void sendHello(ChannelHandlerContext ctx) {
            clientSessionService.sendHello(
                ctx,
                HEARTBEAT_INTERVAL_MS,
                RESUME_WINDOW_MS,
                NetworkConfig.isProximityRadarEnabled(),
                NetworkConfig.isProximityRadarSpeakingOnlyEnabled(),
                NetworkConfig.isGroupSpatialAudio(),
                NetworkConfig.isOpusDataChannelEnabled() ? WebRTCClient.AUDIO_CODEC_OPUS : WebRTCClient.AUDIO_CODEC_PCM
            );
        }
        
        private void handleAuthenticate(ChannelHandlerContext ctx, SignalingMessage message) {
            JsonObject data = message.getData();
            
            // Extract username and auth code
            if (!data.has("username")) {
                sendError(ctx, "Missing username");
                return;
            }
            String username = data.get("username").getAsString();
            
            // Validate auth code if plugin is available
            if (plugin != null) {
                if (!data.has("authCode")) {
                    sendError(ctx, "Missing auth code. Use /vc login in-game to get your code.");
                    return;
                }
                String authCode = data.get("authCode").getAsString();
                
                if (!plugin.getAuthCodeStore().validateCode(username, authCode)) {
                    sendError(ctx, "Invalid auth code. Use /vc login in-game to get the correct code.");
                    logger.atWarning().log("Auth failed for username " + username + " - invalid code");
                    return;
                }
            }
            
            // Get player UUID from auth store or position tracker
            UUID clientId = null;
            if (plugin != null) {
                clientId = plugin.getAuthCodeStore().getPlayerUUID(username);
            }
            if (clientId == null && positionTracker != null) {
                clientId = positionTracker.getPlayerUUIDByUsername(username);
            }
            if (clientId == null) {
                // Reject if we can't find the player
                sendError(ctx, "Player not found. Please log in to the game first.");
                return;
            }

            String negotiatedCodec = SignalingCodecNegotiator.negotiateAudioCodec(data);
            if (negotiatedCodec == null) {
                sendError(ctx, "Client does not support required audio codec: opus", "codec_unsupported");
                return;
            }

            logger.atInfo().log("WebRTC auth validated for " + username + " (UUID: " + clientId + ")");
            
            WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
            client.setSessionId(generateSessionId());
            client.setResumeToken(generateResumeToken());
            client.setLastHeartbeatAt(System.currentTimeMillis());
            client.setNegotiatedAudioCodec(negotiatedCodec);
            boolean playerOnline = plugin == null || plugin.isPlayerOnline(clientId);
            client.setPendingGameSession(!playerOnline);
            clients.put(clientId, client);
            ctx.channel().attr(CLIENT_ATTR).set(client);
            
            if (playerOnline && positionTracker != null) {
                // Add to position tracker with default position (0, 0, 0)
                // Position will be updated when player joins the game
                PlayerPosition position = new PlayerPosition(clientId, username, 0, 0, 0, 0, 0, "overworld");
                positionTracker.addPlayer(position);
                logger.atInfo().log("Added WebRTC client to position tracker: " + username);
            } else if (!playerOnline) {
                schedulePendingAuthDisconnect(clientId);
            }
            
            // Notify listener of client connection
            if (clientListener != null) {
                clientListener.onClientConnected(clientId, username);
            }

            if (playerOnline) {
                syncClientGroupState(ctx, client, null);
            }
            
            // Send success response with obfuscated client ID
            JsonObject responseData = SignalingPayloadFactory.buildSessionResponseData(
                client,
                playerOnline,
                clientIdMapper,
                PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin"),
                NetworkConfig.getStunServers(),
                NetworkConfig.getWebRtcTransportMode(),
                HEARTBEAT_INTERVAL_MS,
                RESUME_WINDOW_MS,
                NetworkConfig.isProximityRadarEnabled(),
                NetworkConfig.isProximityRadarSpeakingOnlyEnabled(),
                NetworkConfig.isGroupSpatialAudio()
            );
            
            SignalingMessage response = new SignalingMessage(
                    SignalingMessage.TYPE_AUTH_SUCCESS, responseData);
            sendMessage(ctx, response);
            sendHello(ctx);
            
            // Broadcast updated player list to all clients only when player is online
            if (playerOnline) {
                broadcastPlayerList();
            }
            
            logger.atInfo().log("WebRTC client authenticated: " + username + " (obfuscated: " + responseData.get("clientId").getAsString() + ")");
        }

        private void handleResume(ChannelHandlerContext ctx, SignalingMessage message) {
            if (ctx.channel().attr(CLIENT_ATTR).get() != null) {
                sendResumeFailed(ctx, "Session already authenticated");
                return;
            }

            JsonObject data = message.getData();
            String sessionId = data.has("sessionId") ? data.get("sessionId").getAsString() : null;
            String resumeToken = data.has("resumeToken") ? data.get("resumeToken").getAsString() : null;
            if (sessionId == null || sessionId.isEmpty() || resumeToken == null || resumeToken.isEmpty()) {
                sendResumeFailed(ctx, "Missing resume data");
                return;
            }

            ResumableSession session = resumableSessions.get(resumeToken);
            if (session == null || !session.sessionId.equals(sessionId)) {
                sendResumeFailed(ctx, "Resume session not found");
                return;
            }
            if (session.expiresAt < System.currentTimeMillis()) {
                resumableSessions.remove(resumeToken);
                clientIdMapper.removeMapping(session.clientId);
                sendResumeFailed(ctx, "Resume window expired");
                return;
            }
            resumableSessions.remove(resumeToken);
            if (clients.containsKey(session.clientId)) {
                sendResumeFailed(ctx, "Session already active");
                return;
            }

            UUID clientId = session.clientId;
            String username = session.username;
            String negotiatedCodec = (session.negotiatedAudioCodec == null || session.negotiatedAudioCodec.isEmpty())
                ? (NetworkConfig.isOpusDataChannelEnabled() ? WebRTCClient.AUDIO_CODEC_OPUS : WebRTCClient.AUDIO_CODEC_PCM)
                : session.negotiatedAudioCodec;
            if (!SignalingCodecNegotiator.clientSupportsCodec(data, negotiatedCodec)) {
                sendError(ctx, "Client does not support required audio codec: " + negotiatedCodec, "codec_unsupported");
                return;
            }

            WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
            client.setSessionId(session.sessionId);
            client.setResumeToken(generateResumeToken());
            client.setLastHeartbeatAt(System.currentTimeMillis());
            client.setNegotiatedAudioCodec(negotiatedCodec);

            boolean playerOnline = plugin == null || plugin.isPlayerOnline(clientId);
            client.setPendingGameSession(!playerOnline);
            clients.put(clientId, client);
            ctx.channel().attr(CLIENT_ATTR).set(client);

            if (playerOnline && positionTracker != null) {
                PlayerPosition position = new PlayerPosition(clientId, username, 0, 0, 0, 0, 0, "overworld");
                positionTracker.addPlayer(position);
                logger.atInfo().log("Added WebRTC client to position tracker: " + username);
            } else if (!playerOnline) {
                schedulePendingAuthDisconnect(clientId);
            }

            if (clientListener != null) {
                clientListener.onClientConnected(clientId, username);
            }

            if (playerOnline && groupStateManager != null) {
                syncClientGroupState(ctx, client, session.lastGroupId);
            }

            JsonObject responseData = SignalingPayloadFactory.buildSessionResponseData(
                client,
                playerOnline,
                clientIdMapper,
                PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin"),
                NetworkConfig.getStunServers(),
                NetworkConfig.getWebRtcTransportMode(),
                HEARTBEAT_INTERVAL_MS,
                RESUME_WINDOW_MS,
                NetworkConfig.isProximityRadarEnabled(),
                NetworkConfig.isProximityRadarSpeakingOnlyEnabled(),
                NetworkConfig.isGroupSpatialAudio()
            );
            SignalingMessage response = new SignalingMessage(SignalingMessage.TYPE_RESUMED, responseData);
            sendMessage(ctx, response);
            sendHello(ctx);

            if (playerOnline) {
                broadcastPlayerList();
            }

            logger.atInfo().log("WebRTC client resumed: " + username + " (obfuscated: " + responseData.get("clientId").getAsString() + ")");
        }

        private void syncClientGroupState(ChannelHandlerContext ctx, WebRTCClient client, UUID fallbackGroupId) {
            if (client == null || groupManager == null || groupStateManager == null) {
                return;
            }

            UUID groupId = null;
            Group group = groupManager.getPlayerGroup(client.getClientId());
            if (group == null && fallbackGroupId != null) {
                group = groupManager.getGroup(fallbackGroupId);
            }
            if (group != null) {
                groupId = group.getGroupId();
            }
            if (groupId == null) {
                return;
            }

            groupStateManager.addClientToGroup(client.getClientId(), client, groupId);

            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", groupId.toString());
            responseData.addProperty("groupName", group.getName());
            SignalingMessage response = new SignalingMessage("group_joined", responseData);
            sendMessage(ctx, response);

            broadcastGroupMembersUpdate(groupId);
        }

        private void sendResumeFailed(ChannelHandlerContext ctx, String reason) {
            JsonObject errorData = new JsonObject();
            errorData.addProperty("message", reason);
            errorData.addProperty("code", "resume_failed");
            SignalingMessage errorMessage = new SignalingMessage(SignalingMessage.TYPE_ERROR, errorData);
            sendMessage(ctx, errorMessage);
        }
        
        private void handleDisconnect(ChannelHandlerContext ctx) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client != null) {
                boolean removeFromPositionTracker = shouldRemoveFromPositionTracker(client.getClientId());
                cleanupClient(client, removeFromPositionTracker);
            }
        }
        
        
        private void handleCreateGroup(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (groupManager == null) {
                sendError(ctx, "Group manager not available");
                return;
            }

            JsonObject data = message.getData();
            String groupName = data.has("groupName") ? data.get("groupName").getAsString() : null;
            
            if (groupName == null || groupName.isEmpty()) {
                sendError(ctx, "Invalid group name");
                return;
            }

            // Extract settings from message if provided
            GroupSettings settings = new GroupSettings();
            boolean isIsolated = NetworkConfig.DEFAULT_GROUP_IS_ISOLATED;
            if (data.has("settings")) {
                JsonObject settingsObj = data.getAsJsonObject("settings");
                int defaultVolume = settingsObj.has("defaultVolume") ? settingsObj.get("defaultVolume").getAsInt() : GroupSettings.DEFAULT_VOLUME;
                double proximityRange = settingsObj.has("proximityRange") ? settingsObj.get("proximityRange").getAsDouble() : GroupSettings.DEFAULT_PROXIMITY_RANGE;
                boolean allowInvites = settingsObj.has("allowInvites") ? settingsObj.get("allowInvites").getAsBoolean() : GroupSettings.DEFAULT_ALLOW_INVITES;
                int maxMembers = settingsObj.has("maxMembers") ? settingsObj.get("maxMembers").getAsInt() : GroupSettings.DEFAULT_MAX_MEMBERS;
                isIsolated = settingsObj.has("isIsolated")
                        ? settingsObj.get("isIsolated").getAsBoolean()
                        : NetworkConfig.DEFAULT_GROUP_IS_ISOLATED;
                settings = new GroupSettings(defaultVolume, proximityRange, allowInvites, maxMembers);
            }

            // Extract password (any group creator can set password)
            String password = null;
            if (data.has("password")) {
                JsonElement passwordElement = data.get("password");
                if (!passwordElement.isJsonNull()) {
                    try {
                        password = passwordElement.getAsString();
                    } catch (ClassCastException | IllegalStateException e) {
                        logger.atWarning().log("Client " + client.getUsername() + " sent invalid password type: " + e.getMessage());
                        sendError(ctx, "Invalid password value");
                        return;
                    }
                }
            }

            // isPermanent is only allowed for admins
            boolean isPermanent = false;
            if (data.has("isPermanent")) {
                JsonElement isPermanentElement = data.get("isPermanent");
                if (!isPermanentElement.isJsonNull()) {
                    try {
                        if (isPermanentElement.getAsBoolean()) {
                            if (PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin")) {
                                isPermanent = true;
                            } else {
                                logger.atWarning().log("Non-admin " + client.getUsername() + " attempted to create permanent group");
                            }
                        }
                    } catch (ClassCastException | IllegalStateException e) {
                        logger.atWarning().log("Client " + client.getUsername() + " sent invalid isPermanent type: " + e.getMessage());
                        sendError(ctx, "Invalid isPermanent value");
                        return;
                    }
                }
            }

            var group = groupManager.createGroup(groupName, isPermanent, client.getClientId(), settings, isIsolated);
            if (group == null) {
                sendError(ctx, "Failed to create group (name may already exist)");
                return;
            }

            // Set password if provided
            if (password != null && !password.isEmpty()) {
                group.setPassword(password);
            }

            // Auto-join creator
            groupManager.joinGroup(client.getClientId(), group.getGroupId());
            groupStateManager.addClientToGroup(client.getClientId(), client, group.getGroupId());

            // Send success response
            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", group.getGroupId().toString());
            responseData.addProperty("groupName", group.getName());
            responseData.addProperty("memberCount", group.getMemberCount());
            responseData.addProperty("membersCount", group.getMemberCount());
            responseData.addProperty("isIsolated", group.isIsolated());
            responseData.addProperty("isPermanent", group.isPermanent());
            responseData.addProperty("hasPassword", group.hasPassword());
            responseData.addProperty("creatorClientId", clientIdMapper.getObfuscatedId(client.getClientId()));
            
            SignalingMessage response = new SignalingMessage("group_created", responseData);
            sendMessage(ctx, response);
            
            logger.atFine().log("Group created by " + client.getUsername() + ": " + groupName);
        }

        private void handleJoinGroup(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (groupManager == null) {
                sendError(ctx, "Group manager not available");
                return;
            }

            JsonObject data = message.getData();
            String groupIdStr = data.has("groupId") ? data.get("groupId").getAsString() : null;
            
            if (groupIdStr == null) {
                sendError(ctx, "Invalid group ID");
                return;
            }

            UUID groupId;
            try {
                groupId = UUID.fromString(groupIdStr);
            } catch (IllegalArgumentException e) {
                sendError(ctx, "Invalid group ID format");
                return;
            }

            var group = groupManager.getGroup(groupId);
            if (group == null) {
                sendError(ctx, "Group not found", "group_not_found");
                return;
            }

            // Validate password if group has one
            if (group.hasPassword()) {
                String password = null;
                if (data.has("password")) {
                    JsonElement passwordElement = data.get("password");
                    if (!passwordElement.isJsonNull()) {
                        try {
                            password = passwordElement.getAsString();
                        } catch (ClassCastException | IllegalStateException e) {
                            // Treat invalid password type as incorrect password
                            logger.atWarning().log("Client " + client.getUsername() + " sent invalid password type for group join: " + e.getMessage());
                            sendError(ctx, "Incorrect password", "incorrect_password");
                            return;
                        }
                    }
                }
                if (!group.checkPassword(password)) {
                    sendError(ctx, "Incorrect password", "incorrect_password");
                    return;
                }
            }

            // Check capacity
            if (group.getSettings().isAtCapacity(group.getMemberCount())) {
                sendError(ctx, "Group is at capacity", "group_full");
                return;
            }

            boolean joined = groupManager.joinGroup(client.getClientId(), groupId);
            if (!joined) {
                sendError(ctx, "Failed to join group");
                return;
            }

            groupStateManager.addClientToGroup(client.getClientId(), client, groupId);

            // Send success response
            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", groupId.toString());
            responseData.addProperty("groupName", group.getName());
            
            SignalingMessage response = new SignalingMessage("group_joined", responseData);
            sendMessage(ctx, response);

            // Broadcast member list update to all group members
            broadcastGroupMembersUpdate(groupId);
            
            logger.atFine().log("Client " + client.getUsername() + " joined group: " + group.getName());
        }

        private void handleLeaveGroup(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (groupManager == null) {
                sendError(ctx, "Group manager not available");
                return;
            }

            UUID groupId = groupStateManager.getClientGroup(client.getClientId());
            if (groupId == null) {
                sendError(ctx, "Not in any group");
                return;
            }

            groupManager.leaveGroup(client.getClientId());
            groupStateManager.removeClientFromAllGroups(client.getClientId());

            // Calculate remaining member count
            int memberCount = groupManager.getGroupMembers(groupId).size();

            // Send success response with updated member count
            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", groupId.toString());
            responseData.addProperty("memberCount", memberCount);
            SignalingMessage response = new SignalingMessage("group_left", responseData);
            sendMessage(ctx, response);

            // Broadcast member list update
            broadcastGroupMembersUpdate(groupId);
            
            logger.atFine().log("Client " + client.getUsername() + " left group: " + groupId);
        }

        private void handleUpdateGroupPassword(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (groupManager == null) {
                sendError(ctx, "Group manager not available");
                return;
            }

            JsonObject data = message.getData();
            String groupIdStr = data.has("groupId") ? data.get("groupId").getAsString() : null;
            if (groupIdStr == null) {
                sendError(ctx, "Invalid group ID");
                return;
            }

            UUID groupId;
            try {
                groupId = UUID.fromString(groupIdStr);
            } catch (IllegalArgumentException e) {
                sendError(ctx, "Invalid group ID format");
                return;
            }

            var group = groupManager.getGroup(groupId);
            if (group == null) {
                sendError(ctx, "Group not found");
                return;
            }

            // Only the group creator can change the password
            if (!group.isCreator(client.getClientId())) {
                sendError(ctx, "Only the group creator can change the password");
                return;
            }

            // password=null or empty string removes the password
            String password = data.has("password") && !data.get("password").isJsonNull()
                    ? data.get("password").getAsString()
                    : null;
            group.setPassword(password);

            // Send confirmation
            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", groupId.toString());
            responseData.addProperty("hasPassword", group.hasPassword());
            SignalingMessage response = new SignalingMessage("group_password_updated", responseData);
            sendMessage(ctx, response);

            // Broadcast updated group list so all clients see the password status change
            broadcastGroupList();

            logger.atInfo().log("Group " + group.getName() + " password " +
                    (group.hasPassword() ? "set" : "removed") + " by " + client.getUsername());
        }

        private void handleSetGroupPermanent(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (groupManager == null) {
                sendError(ctx, "Group manager not available");
                return;
            }

            // Only admins can toggle permanent (uses Hytale's built-in permission system)
            if (!PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin")) {
                sendError(ctx, "Only server admins can mark groups as permanent");
                return;
            }

            JsonObject data = message.getData();
            String groupIdStr = data.has("groupId") ? data.get("groupId").getAsString() : null;
            boolean isPermanent = false;
            if (data.has("isPermanent")) {
                JsonElement isPermanentElement = data.get("isPermanent");
                if (!isPermanentElement.isJsonNull()) {
                    try {
                        isPermanent = isPermanentElement.getAsBoolean();
                    } catch (ClassCastException | IllegalStateException e) {
                        logger.atWarning().log("Client " + client.getUsername() + " sent invalid isPermanent type for setPermanent: " + e.getMessage());
                        sendError(ctx, "Invalid isPermanent value");
                        return;
                    }
                }
            }

            if (groupIdStr == null) {
                sendError(ctx, "Invalid group ID");
                return;
            }

            UUID groupId;
            try {
                groupId = UUID.fromString(groupIdStr);
            } catch (IllegalArgumentException e) {
                sendError(ctx, "Invalid group ID format");
                return;
            }

            var group = groupManager.getGroup(groupId);
            if (group == null) {
                sendError(ctx, "Group not found");
                return;
            }

            group.setPermanent(isPermanent);

            // Send confirmation
            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", groupId.toString());
            responseData.addProperty("isPermanent", group.isPermanent());
            SignalingMessage response = new SignalingMessage("group_permanent_updated", responseData);
            sendMessage(ctx, response);

            // Broadcast updated group list
            broadcastGroupList();

            logger.atInfo().log("Group " + group.getName() + " permanent=" + isPermanent + " set by admin " + client.getUsername());
        }

        private void handleUserSpeakingStatus(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }

            JsonObject data = message.getData();
            boolean isSpeaking = data.has("isSpeaking") ? data.get("isSpeaking").getAsBoolean() : false;
            
            client.setSpeaking(isSpeaking);
            
            // Debounced broadcast to group
            UUID groupId = groupStateManager.getClientGroup(client.getClientId());
            if (groupId != null) {
                JsonObject broadcastData = new JsonObject();
                broadcastData.addProperty("userId", clientIdMapper.getObfuscatedId(client.getClientId()));
                broadcastData.addProperty("isSpeaking", isSpeaking);
                broadcastData.addProperty("username", client.getUsername());
                SignalingMessage broadcastMsg = new SignalingMessage("user_speaking_status", broadcastData);
                groupStateManager.broadcastToGroup(groupId, broadcastMsg, client.getClientId());
            }
        }

        private void handleUserMuteStatus(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }

            JsonObject data = message.getData();
            boolean isMuted = data.has("isMuted") && data.get("isMuted").getAsBoolean();

            client.setMuted(isMuted);

            broadcastMuteStatus(client, isMuted);
        }

        private void handlePing(ChannelHandlerContext ctx, SignalingMessage message) {
            JsonObject data = message.getData();
            long timestamp = data.has("timestamp") ? data.get("timestamp").getAsLong() : System.currentTimeMillis();
            
            JsonObject responseData = new JsonObject();
            responseData.addProperty("timestamp", timestamp);
            SignalingMessage response = new SignalingMessage("pong", responseData);
            sendMessage(ctx, response);
        }

        private void broadcastGroupMembersUpdate(UUID groupId) {
            if (groupManager == null) {
                return;
            }

            var group = groupManager.getGroup(groupId);
            if (group == null) {
                return;
            }

            com.google.gson.JsonArray membersArray = groupStateManager.getGroupMembersJson(groupId, clients, clientIdMapper);
            JsonObject broadcastData = SignalingPayloadFactory.buildGroupMembersUpdateData(
                groupId,
                group.getName(),
                membersArray
            );

            SignalingMessage broadcastMsg = new SignalingMessage("group_members_updated", broadcastData);
            groupStateManager.broadcastToGroupAll(groupId, broadcastMsg);
        }
        
        private void sendMessage(ChannelHandlerContext ctx, SignalingMessage message) {
            ctx.channel().writeAndFlush(new TextWebSocketFrame(message.toJson()));
        }
        
        private void sendError(ChannelHandlerContext ctx, String error) {
            sendError(ctx, error, null);
        }

        private void sendError(ChannelHandlerContext ctx, String error, String code) {
            JsonObject errorData = new JsonObject();
            errorData.addProperty("message", error);
            if (code != null && !code.isEmpty()) {
                errorData.addProperty("code", code);
            }
            SignalingMessage errorMessage = new SignalingMessage(
                    SignalingMessage.TYPE_ERROR, errorData);
            sendMessage(ctx, errorMessage);
        }
        
        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            StringWriter stackTrace = new StringWriter();
            cause.printStackTrace(new PrintWriter(stackTrace));
            logger.atSevere().log("WebSocket error: " + cause.toString());
            logger.atSevere().log("WebSocket stack trace:\n" + stackTrace);
            ctx.close();
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client != null) {
                boolean removeFromPositionTracker = shouldRemoveFromPositionTracker(client.getClientId());
                cleanupClient(client, removeFromPositionTracker);
            }
            ctx.fireChannelInactive();
        }
        
        private String getWebSocketLocation(FullHttpRequest req) {
            String location = req.headers().get(HttpHeaderNames.HOST) + "/voice";
            String protocol = NetworkConfig.isSSLEnabled() ? "wss://" : "ws://";
            return protocol + location;
        }
        
        private void sendHttpResponse(ChannelHandlerContext ctx, FullHttpRequest req, FullHttpResponse res) {
            if (res.status().code() != 200) {
                res.content().writeBytes(res.status().toString().getBytes());
            }
            
            ChannelFuture f = ctx.channel().writeAndFlush(res);
            if (!HttpUtil.isKeepAlive(req) || res.status().code() != 200) {
                f.addListener(ChannelFutureListener.CLOSE);
            }
        }
        
    }

    private static class ResumableSession {
        private final UUID clientId;
        private final String username;
        private final String sessionId;
        private final String resumeToken;
        private final UUID lastGroupId;
        private final String negotiatedAudioCodec;
        private final long expiresAt;

        private ResumableSession(UUID clientId, String username, String sessionId, String resumeToken, UUID lastGroupId, String negotiatedAudioCodec, long expiresAt) {
            this.clientId = clientId;
            this.username = username;
            this.sessionId = sessionId;
            this.resumeToken = resumeToken;
            this.lastGroupId = lastGroupId;
            this.negotiatedAudioCodec = negotiatedAudioCodec;
            this.expiresAt = expiresAt;
        }
    }
}
