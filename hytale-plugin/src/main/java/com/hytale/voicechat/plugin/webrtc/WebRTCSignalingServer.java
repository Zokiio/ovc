package com.hytale.voicechat.plugin.webrtc;

import com.google.gson.JsonObject;
import com.hytale.voicechat.common.model.Group;
import com.hytale.voicechat.common.model.GroupSettings;
import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.common.signaling.SignalingMessage;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.plugin.HytaleVoiceChatPlugin;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.component.Ref;
import com.hypixel.hytale.component.Store;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.entity.entities.Player;
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

/**
 * WebSocket server for WebRTC signaling between web clients and server
 */
public class WebRTCSignalingServer implements GroupManager.GroupEventListener {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final AttributeKey<WebRTCClient> CLIENT_ATTR = AttributeKey.valueOf("webrtc_client");
    
    private final int port;
    private final Map<UUID, WebRTCClient> clients;
    private final ClientIdMapper clientIdMapper;
    private PlayerPositionTracker positionTracker;
    private WebRTCAudioBridge audioBridge;
    private WebRTCPeerManager peerManager;
    private WebRTCClientListener clientListener;
    private GroupStateManager groupStateManager;
    private GroupManager groupManager;
    private HytaleVoiceChatPlugin plugin;
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;
    private SslContext sslContext;
    private java.util.concurrent.ScheduledExecutorService positionBroadcastScheduler;
    private java.util.concurrent.ScheduledExecutorService pendingAuthScheduler;
    private final java.util.concurrent.ConcurrentHashMap<UUID, java.util.concurrent.ScheduledFuture<?>> pendingAuthDisconnects = new java.util.concurrent.ConcurrentHashMap<>();
    private static final long POSITION_BROADCAST_INTERVAL_MS = 100; // 10 Hz
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
    }
    
    public void setPlugin(HytaleVoiceChatPlugin plugin) {
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
        logger.atInfo().log("WebRTC peer manager set");
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
        broadcastData.addProperty("membersCount", 1); // Creator is automatically added
        broadcastData.addProperty("maxMembers", group.getSettings().getMaxMembers());
        broadcastData.addProperty("proximityRange", group.getSettings().getProximityRange());
        broadcastData.addProperty("creatorClientId", clientIdMapper.getObfuscatedId(creatorId));
        
        SignalingMessage broadcastMsg = new SignalingMessage("group_created", broadcastData);
        broadcastToAll(broadcastMsg);
        
        // Refresh group list for all clients
        broadcastGroupList();
    }
    
    /**
     * Broadcast player joining a group to all connected web clients
     */
    @Override
    public void onPlayerJoinedGroup(UUID playerId, Group group) {
        logger.atFine().log("Broadcasting player joined group: " + playerId + " joined " + group.getName());
        broadcastGroupList();
    }
    
    /**
     * Broadcast player leaving a group to all connected web clients
     */
    @Override
    public void onPlayerLeftGroup(UUID playerId, Group group, boolean groupDeleted) {
        logger.atFine().log("Broadcasting player left group: " + playerId + " left " + group.getName());
        broadcastGroupList(); // Always refresh full list
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
        
        com.google.gson.JsonArray groupsArray = new com.google.gson.JsonArray();
        for (Group group : groupManager.listGroups()) {
            JsonObject groupObj = new JsonObject();
            groupObj.addProperty("id", group.getGroupId().toString());
            groupObj.addProperty("name", group.getName());
            groupObj.addProperty("memberCount", group.getMemberCount());
            groupObj.addProperty("maxMembers", group.getSettings().getMaxMembers());
            groupObj.addProperty("proximityRange", group.getSettings().getProximityRange());
            groupsArray.add(groupObj);
        }
        
        JsonObject data = new JsonObject();
        data.add("groups", groupsArray);
        
        SignalingMessage message = new SignalingMessage("group_list", data);
        broadcastToAll(message);
    }
    
    /**
     * Broadcast current player list to all connected web clients
     */
    private void broadcastPlayerList() {
        com.google.gson.JsonArray playersArray = new com.google.gson.JsonArray();
        
        for (WebRTCClient client : clients.values()) {
            if (client != null && client.isConnected() && !client.isPendingGameSession()) {
                JsonObject playerObj = new JsonObject();
                playerObj.addProperty("id", clientIdMapper.getObfuscatedId(client.getClientId()));
                playerObj.addProperty("username", client.getUsername());
                playerObj.addProperty("isSpeaking", client.isSpeaking());
                
                // Include group info if player is in a group
                java.util.UUID groupId = groupStateManager.getClientGroup(client.getClientId());
                if (groupId != null) {
                    playerObj.addProperty("groupId", groupId.toString());
                }
                
                playersArray.add(playerObj);
            }
        }
        
        JsonObject data = new JsonObject();
        data.add("players", playersArray);
        
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
        WebRTCClient existing = clients.remove(clientId);
        if (existing == null) {
            return;
        }

        cancelPendingAuthDisconnect(clientId);

        // Remove from group state
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

        // Remove obfuscated ID mapping
        clientIdMapper.removeMapping(clientId);

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
        
        positionBroadcastScheduler.scheduleAtFixedRate(
            this::broadcastPositions,
            POSITION_BROADCAST_INTERVAL_MS,
            POSITION_BROADCAST_INTERVAL_MS,
            java.util.concurrent.TimeUnit.MILLISECONDS
        );
        
        logger.atInfo().log("Position broadcaster started (interval: " + POSITION_BROADCAST_INTERVAL_MS + "ms)");
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
                        if (!SignalingMessage.TYPE_DISCONNECT.equals(message.getType()) && !"ping".equals(message.getType())) {
                            sendPendingStatus(ctx, pendingClient);
                            return;
                        }
                    }
                }
                
                switch (message.getType()) {
                    case SignalingMessage.TYPE_AUTHENTICATE:
                        handleAuthenticate(ctx, message);
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
                        handleListGroups(ctx, message);
                        break;
                    case "list_players":
                        handleListPlayers(ctx, message);
                        break;
                    case "get_group_members":
                        handleGetGroupMembers(ctx, message);
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
                    case "audio":
                        handleAudioData(ctx, message);
                        break;
                    case "start_datachannel":
                        handleStartDataChannel(ctx);
                        break;
                    case SignalingMessage.TYPE_DISCONNECT:
                        handleDisconnect(ctx);
                        break;
                    case SignalingMessage.TYPE_OFFER:
                        handleOffer(ctx, message);
                        break;
                    case SignalingMessage.TYPE_ICE_CANDIDATE:
                        handleIceCandidate(ctx, message);
                        break;
                    default:
                        logger.atWarning().log("Unknown signaling message type: " + message.getType());
                }
            } catch (Exception e) {
                logger.atSevere().log("Error handling signaling message", e);
                sendError(ctx, "Invalid message format");
            }
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

            logger.atInfo().log("WebRTC auth validated for " + username + " (UUID: " + clientId + ")");
            
            WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
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
            
            // Send success response with obfuscated client ID
            String obfuscatedId = clientIdMapper.getObfuscatedId(clientId);
            JsonObject responseData = new JsonObject();
            responseData.addProperty("clientId", obfuscatedId);
            responseData.addProperty("username", username);
            responseData.addProperty("pending", !playerOnline);
            if (!playerOnline) {
            int timeoutSeconds = NetworkConfig.getPendingGameJoinTimeoutSeconds();
            String messageText = timeoutSeconds > 0
                    ? "Waiting for game session... disconnecting in " + timeoutSeconds + "s."
                    : "Waiting for game session...";
            responseData.addProperty("pendingMessage", messageText);
            responseData.addProperty("pendingTimeoutSeconds", timeoutSeconds);
        }
            
            SignalingMessage response = new SignalingMessage(
                    SignalingMessage.TYPE_AUTH_SUCCESS, responseData);
            sendMessage(ctx, response);
            
            // Broadcast updated player list to all clients only when player is online
            if (playerOnline) {
                broadcastPlayerList();
            }
            
            logger.atInfo().log("WebRTC client authenticated: " + username + " (obfuscated: " + obfuscatedId + ")");
        }
        
        private void handleAudioData(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            
            try {
                // Extract audio data from message
                JsonObject data = message.getData();
                if (data.has("audioData")) {
                    // Audio data is sent as base64 or direct bytes
                    String audioDataStr = data.get("audioData").getAsString();
                    byte[] audioData = decodeAudioData(audioDataStr);
                    // logger.atInfo().log("Received audio data from WebRTC client " + client.getClientId() + " (" + audioData.length + " bytes)");
                    
                    // Send to audio bridge for SFU routing
                    if (audioBridge != null) {
                        // logger.atInfo().log("Forwarding audio to WebRTC audio bridge (running=" + audioBridge.isRunning() + ")");
                        audioBridge.receiveAudioFromWebRTC(client.getClientId(), audioData);
                    } else {
                        logger.atWarning().log("Audio bridge not set; dropping WebRTC audio from " + client.getClientId());
                    }
                }
            } catch (Exception e) {
                logger.atWarning().log("Error handling audio data from client " + client.getClientId() + ": " + e.getMessage());
            }
        }

        private void handleOffer(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (peerManager == null) {
                sendError(ctx, "WebRTC peer manager not available");
                return;
            }

            JsonObject data = message.getData();
            if (!data.has("sdp")) {
                sendError(ctx, "Missing SDP offer");
                return;
            }

            String offerSdp = data.get("sdp").getAsString();
            String answerSdp = peerManager.createPeerConnection(client.getClientId(), offerSdp);

            JsonObject responseData = new JsonObject();
            responseData.addProperty("sdp", answerSdp);
            SignalingMessage response = new SignalingMessage(SignalingMessage.TYPE_ANSWER, responseData);
            sendMessage(ctx, response);
        }

        private void handleIceCandidate(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (peerManager == null) {
                sendError(ctx, "WebRTC peer manager not available");
                return;
            }

            JsonObject data = message.getData();
            if (!data.has("candidate")) {
                sendError(ctx, "Missing ICE candidate");
                return;
            }

            String candidate = data.get("candidate").getAsString();
            String sdpMid = data.has("sdpMid") ? data.get("sdpMid").getAsString() : null;
            int sdpMLineIndex = data.has("sdpMLineIndex") ? data.get("sdpMLineIndex").getAsInt() : -1;

            peerManager.handleIceCandidate(client.getClientId(), candidate, sdpMid, sdpMLineIndex);
        }

        private void handleStartDataChannel(ChannelHandlerContext ctx) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            if (peerManager == null) {
                sendError(ctx, "WebRTC peer manager not available");
                return;
            }

            peerManager.startDataChannelTransport(client.getClientId());
        }
        
        /**
         * Decode audio data from the message format
         * Audio can be sent as base64 string or raw bytes
         */
        private byte[] decodeAudioData(String audioDataStr) {
            // Try to decode as base64 first
            try {
                return java.util.Base64.getDecoder().decode(audioDataStr);
            } catch (IllegalArgumentException e) {
                // Not base64, treat as raw string and convert to bytes
                return audioDataStr.getBytes(java.nio.charset.StandardCharsets.UTF_8);
            }
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
            if (data.has("settings")) {
                JsonObject settingsObj = data.getAsJsonObject("settings");
                int defaultVolume = settingsObj.has("defaultVolume") ? settingsObj.get("defaultVolume").getAsInt() : GroupSettings.DEFAULT_VOLUME;
                double proximityRange = settingsObj.has("proximityRange") ? settingsObj.get("proximityRange").getAsDouble() : GroupSettings.DEFAULT_PROXIMITY_RANGE;
                boolean allowInvites = settingsObj.has("allowInvites") ? settingsObj.get("allowInvites").getAsBoolean() : GroupSettings.DEFAULT_ALLOW_INVITES;
                int maxMembers = settingsObj.has("maxMembers") ? settingsObj.get("maxMembers").getAsInt() : GroupSettings.DEFAULT_MAX_MEMBERS;
                settings = new GroupSettings(defaultVolume, proximityRange, allowInvites, maxMembers);
            }

            var group = groupManager.createGroup(groupName, false, client.getClientId(), settings);
            if (group == null) {
                sendError(ctx, "Failed to create group (name may already exist)");
                return;
            }

            // Auto-join creator
            groupManager.joinGroup(client.getClientId(), group.getGroupId());
            groupStateManager.addClientToGroup(client.getClientId(), client, group.getGroupId());

            // Send success response
            JsonObject responseData = new JsonObject();
            responseData.addProperty("groupId", group.getGroupId().toString());
            responseData.addProperty("groupName", group.getName());
            responseData.addProperty("membersCount", group.getMemberCount());
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
                sendError(ctx, "Group not found");
                return;
            }

            // Check capacity
            if (group.getSettings().isAtCapacity(group.getMemberCount())) {
                sendError(ctx, "Group is at capacity");
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

            groupStateManager.removeClientFromAllGroups(client.getClientId());
            groupManager.leaveGroup(client.getClientId());

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

        private void handleListGroups(ChannelHandlerContext ctx, SignalingMessage message) {
            if (groupManager == null) {
                sendError(ctx, "Group manager not available");
                return;
            }

            var groups = groupManager.listGroups();
            com.google.gson.JsonArray groupsArray = new com.google.gson.JsonArray();
            
            for (var group : groups) {
                JsonObject groupObj = new JsonObject();
                groupObj.addProperty("id", group.getGroupId().toString());
                groupObj.addProperty("name", group.getName());
                groupObj.addProperty("memberCount", group.getMemberCount());
                groupObj.addProperty("maxMembers", group.getSettings().getMaxMembers());
                groupObj.addProperty("proximityRange", group.getSettings().getProximityRange());
                
                // Include members list
                com.google.gson.JsonArray membersArray = groupStateManager.getGroupMembersJson(group.getGroupId(), clients, clientIdMapper);
                groupObj.add("members", membersArray);
                
                groupsArray.add(groupObj);
            }

            JsonObject responseData = new JsonObject();
            responseData.add("groups", groupsArray);
            SignalingMessage response = new SignalingMessage("group_list", responseData);
            sendMessage(ctx, response);
        }

        private void handleListPlayers(ChannelHandlerContext ctx, SignalingMessage message) {
            // Return all connected web clients as players
            com.google.gson.JsonArray playersArray = new com.google.gson.JsonArray();
            
            for (WebRTCClient client : clients.values()) {
                if (client != null && client.isConnected() && !client.isPendingGameSession()) {
                    JsonObject playerObj = new JsonObject();
                    playerObj.addProperty("id", clientIdMapper.getObfuscatedId(client.getClientId()));
                    playerObj.addProperty("username", client.getUsername());
                    playerObj.addProperty("isSpeaking", client.isSpeaking());
                    // Note: "isMuted" represents microphone mute status (not speaker/output mute)
                    // Clients map this to "isMicMuted" to distinguish from local speaker mute
                    playerObj.addProperty("isMuted", client.isMuted());
                    
                    // Include group info if player is in a group
                    UUID groupId = groupStateManager.getClientGroup(client.getClientId());
                    if (groupId != null) {
                        playerObj.addProperty("groupId", groupId.toString());
                    }
                    
                    playersArray.add(playerObj);
                }
            }
            
            JsonObject responseData = new JsonObject();
            responseData.add("players", playersArray);
            SignalingMessage response = new SignalingMessage("player_list", responseData);
            sendMessage(ctx, response);
        }

        private void handleGetGroupMembers(ChannelHandlerContext ctx, SignalingMessage message) {
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

            com.google.gson.JsonArray membersArray = groupStateManager.getGroupMembersJson(groupId, clients, clientIdMapper);
            
            JsonObject responseData = new JsonObject();
            responseData.add("members", membersArray);
            SignalingMessage response = new SignalingMessage("group_members_list", responseData);
            sendMessage(ctx, response);
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
                broadcastData.addProperty("userId", client.getClientId().toString());
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
            JsonObject broadcastData = new JsonObject();
            broadcastData.addProperty("groupId", groupId.toString());
            broadcastData.addProperty("groupName", group.getName());
            broadcastData.addProperty("memberCount", membersArray.size());
            broadcastData.add("members", membersArray);
            
            SignalingMessage broadcastMsg = new SignalingMessage("group_members_updated", broadcastData);
            groupStateManager.broadcastToGroupAll(groupId, broadcastMsg);
        }
        
        private void sendMessage(ChannelHandlerContext ctx, SignalingMessage message) {
            ctx.channel().writeAndFlush(new TextWebSocketFrame(message.toJson()));
        }
        
        private void sendError(ChannelHandlerContext ctx, String error) {
            JsonObject errorData = new JsonObject();
            errorData.addProperty("message", error);
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
}
