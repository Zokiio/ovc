package com.hytale.voicechat.plugin.webrtc;

import com.google.gson.JsonObject;
import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.common.signaling.SignalingMessage;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.logger.HytaleLogger;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.channel.*;
import io.netty.channel.MultiThreadIoEventLoopGroup;
import io.netty.channel.nio.NioIoHandler;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.http.*;
import io.netty.handler.codec.http.websocketx.*;
import io.netty.util.AttributeKey;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket server for WebRTC signaling between web clients and server
 */
public class WebRTCSignalingServer {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final AttributeKey<WebRTCClient> CLIENT_ATTR = AttributeKey.valueOf("webrtc_client");
    
    private final int port;
    private final Map<UUID, WebRTCClient> clients;
    private PlayerPositionTracker positionTracker;
    private WebRTCAudioBridge audioBridge;
    private WebRTCPeerManager peerManager;
    private WebRTCClientListener clientListener;
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;
    
    /**
     * Listener interface for web client connection/disconnection events
     */
    public interface WebRTCClientListener {
        void onClientConnected(UUID clientId, String username);
        void onClientDisconnected(UUID clientId, String username);
    }
    
    public WebRTCSignalingServer() {
        this(NetworkConfig.DEFAULT_SIGNALING_PORT);
    }
    
    public WebRTCSignalingServer(int port) {
        this.port = port;
        this.clients = new ConcurrentHashMap<>();
    }
    
    public void setPositionTracker(PlayerPositionTracker tracker) {
        this.positionTracker = tracker;
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
    
    public void start() throws InterruptedException {
        bossGroup = new MultiThreadIoEventLoopGroup(1, NioIoHandler.newFactory());
        workerGroup = new MultiThreadIoEventLoopGroup(NioIoHandler.newFactory());
        
        try {
            ServerBootstrap bootstrap = new ServerBootstrap();
            bootstrap.group(bossGroup, workerGroup)
                    .channel(NioServerSocketChannel.class)
                    .childHandler(new ChannelInitializer<SocketChannel>() {
                        @Override
                        protected void initChannel(SocketChannel ch) {
                            ChannelPipeline pipeline = ch.pipeline();
                            pipeline.addLast(new HttpServerCodec());
                            pipeline.addLast(new HttpObjectAggregator(65536));
                            pipeline.addLast(new WebSocketServerHandler());
                        }
                    });
            
            serverChannel = bootstrap.bind(port).sync().channel();
            logger.atInfo().log("WebRTC signaling server started on port " + port);
            
            // Start audio bridge if available
            if (audioBridge != null && !audioBridge.isRunning()) {
                logger.atInfo().log("Starting WebRTC audio bridge");
                audioBridge.start();
            } else if (audioBridge == null) {
                logger.atWarning().log("WebRTC audio bridge is not set; audio routing disabled");
            }
        } catch (Exception e) {
            logger.atSevere().log("Failed to start WebRTC signaling server", e);
            shutdown();
            throw e;
        }
    }
    
    public void shutdown() {
        logger.atInfo().log("Shutting down WebRTC signaling server");
        
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
                client.disconnect();
            } catch (Exception e) {
                logger.atWarning().log("Error disconnecting client: " + e.getMessage());
            }
        });
        clients.clear();
        
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
                
                switch (message.getType()) {
                    case SignalingMessage.TYPE_AUTHENTICATE:
                        handleAuthenticate(ctx, message);
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
            String username = data.get("username").getAsString();
            
            // Create new client. Prefer binding to existing player UUID (by username) so GUI linkage works like UDP
            UUID clientId = null;
            if (positionTracker != null) {
                clientId = positionTracker.getPlayerUUIDByUsername(username);
                if (clientId != null) {
                    logger.atInfo().log("WebRTC auth mapped username " + username + " to existing player UUID: " + clientId);
                }
            }
            if (clientId == null) {
                clientId = UUID.randomUUID();
            }
            WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
            clients.put(clientId, client);
            ctx.channel().attr(CLIENT_ATTR).set(client);
            
            // Add to position tracker with default position (0, 0, 0)
            // Position will be updated when player joins the game
            if (positionTracker != null) {
                PlayerPosition position = new PlayerPosition(clientId, username, 0, 0, 0, 0, 0, "overworld");
                positionTracker.addPlayer(position);
                logger.atInfo().log("Added WebRTC client to position tracker: " + username);
            }
            
            // Notify listener of client connection
            if (clientListener != null) {
                clientListener.onClientConnected(clientId, username);
            }
            
            // Send success response
            JsonObject responseData = new JsonObject();
            responseData.addProperty("clientId", clientId.toString());
            responseData.addProperty("username", username);
            
            SignalingMessage response = new SignalingMessage(
                    SignalingMessage.TYPE_AUTH_SUCCESS, responseData);
            sendMessage(ctx, response);
            
            logger.atInfo().log("WebRTC client authenticated: " + username + " (" + clientId + ")");
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
                // Notify listener of client disconnection
                if (clientListener != null) {
                    clientListener.onClientDisconnected(client.getClientId(), client.getUsername());
                }
                
                // Remove from position tracker
                if (positionTracker != null) {
                    positionTracker.removePlayer(client.getClientId());
                    logger.atInfo().log("Removed WebRTC client from position tracker: " + client.getClientId());
                }
                clients.remove(client.getClientId());
                logger.atInfo().log("WebRTC client disconnected: " + client.getClientId());
            }
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
        
        private String getWebSocketLocation(FullHttpRequest req) {
            String location = req.headers().get(HttpHeaderNames.HOST) + "/voice";
            return "ws://" + location;
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
