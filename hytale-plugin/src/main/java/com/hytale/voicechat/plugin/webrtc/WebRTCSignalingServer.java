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
                logger.atWarning().log("Error disconnecting client: {}", e.getMessage());
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
                logger.atFine().log("WebSocket handshake completed for {}", ctx.channel().remoteAddress());
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
                logger.atFine().log("Received signaling message: {}", message.getType());
                
                switch (message.getType()) {
                    case SignalingMessage.TYPE_AUTHENTICATE:
                        handleAuthenticate(ctx, message);
                        break;
                    case "audio":
                        handleAudioData(ctx, message);
                        break;
                    case SignalingMessage.TYPE_DISCONNECT:
                        handleDisconnect(ctx);
                        break;
                    // Legacy WebRTC peer connection messages (now ignored)
                    case SignalingMessage.TYPE_OFFER:
                    case SignalingMessage.TYPE_ICE_CANDIDATE:
                        logger.atFine().log("Ignoring legacy WebRTC message: {}", message.getType());
                        break;
                    default:
                        logger.atWarning().log("Unknown signaling message type: {}", message.getType());
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
                    logger.atInfo().log("Received audio data from WebRTC client " + client.getClientId() + " (" + audioData.length + " bytes)");
                    
                    // Send to audio bridge for SFU routing
                    if (audioBridge != null) {
                        logger.atInfo().log("Forwarding audio to WebRTC audio bridge (running=" + audioBridge.isRunning() + ")");
                        audioBridge.receiveAudioFromWebRTC(client.getClientId(), audioData);
                    } else {
                        logger.atWarning().log("Audio bridge not set; dropping WebRTC audio from " + client.getClientId());
                    }
                }
            } catch (Exception e) {
                logger.atWarning().log("Error handling audio data from client {}: {}", client.getClientId(), e.getMessage());
            }
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
                    logger.atInfo().log("Removed WebRTC client from position tracker: {}", client.getClientId());
                }
                clients.remove(client.getClientId());
                logger.atInfo().log("WebRTC client disconnected: {}", client.getClientId());
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
            logger.atSevere().log("WebSocket error", cause);
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
        
        /**
         * Create an SDP answer that matches the m-lines and directionality from the client's offer
         * Parses the offer to identify all media sections (audio, datachannel, etc.)
         * and generates a corresponding answer with matching direction attributes
         */
        private String createAnswerSdp(String offerSdp) {
            StringBuilder answer = new StringBuilder();
            answer.append("v=0\r\n");
            answer.append("o=- 0 0 IN IP4 0.0.0.0\r\n");
            answer.append("s=Hytale Voice Chat\r\n");
            answer.append("t=0 0\r\n");
            
            // Parse offer to extract m-lines and their properties
            String[] lines = offerSdp.split("\r\n");
            StringBuilder bundleLineBuilder = new StringBuilder();
            bundleLineBuilder.append("a=group:BUNDLE");
            
            boolean hasAudio = false;
            boolean hasDataChannel = false;
            String audioMid = null;
            String datachannelMid = null;
            String audioDirection = "sendrecv";  // default
            String datachannelDirection = "sendrecv";  // default
            
            // First pass: identify media types and their mids
            for (String line : lines) {
                if (line.startsWith("m=audio")) {
                    hasAudio = true;
                } else if (line.startsWith("m=application")) {
                    hasDataChannel = true;
                }
            }
            
            // Second pass: extract mids and directions
            boolean inAudioSection = false;
            boolean inDataChannelSection = false;
            for (String line : lines) {
                if (line.startsWith("m=audio")) {
                    inAudioSection = true;
                    inDataChannelSection = false;
                } else if (line.startsWith("m=application")) {
                    inAudioSection = false;
                    inDataChannelSection = true;
                } else if (line.startsWith("m=")) {
                    inAudioSection = false;
                    inDataChannelSection = false;
                }
                
                if (line.startsWith("a=mid:")) {
                    String mid = line.substring("a=mid:".length()).trim();
                    if (inAudioSection && audioMid == null) {
                        audioMid = mid;
                    } else if (inDataChannelSection && datachannelMid == null) {
                        datachannelMid = mid;
                    }
                }
                
                // Extract direction attributes
                if (inAudioSection && (line.equals("a=sendrecv") || line.equals("a=sendonly") || 
                    line.equals("a=recvonly") || line.equals("a=inactive"))) {
                    audioDirection = line.substring("a=".length());
                }
                if (inDataChannelSection && (line.equals("a=sendrecv") || line.equals("a=sendonly") || 
                    line.equals("a=recvonly") || line.equals("a=inactive"))) {
                    datachannelDirection = line.substring("a=".length());
                }
            }
            
            // Convert offer direction to answer direction (inverse)
            String answerAudioDirection = invertDirection(audioDirection);
            String answerDataChannelDirection = invertDirection(datachannelDirection);
            
            // Build BUNDLE line with all media types
            if (hasAudio) {
                bundleLineBuilder.append(" ").append(audioMid != null ? audioMid : "0");
            }
            if (hasDataChannel) {
                bundleLineBuilder.append(" ").append(datachannelMid != null ? datachannelMid : "1");
            }
            answer.append(bundleLineBuilder).append("\r\n");
            
            // Add audio m-line if present in offer
            if (hasAudio) {
                answer.append("m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n");
                answer.append("c=IN IP4 0.0.0.0\r\n");
                answer.append("a=rtcp:9 IN IP4 0.0.0.0\r\n");
                answer.append("a=ice-ufrag:placeholder\r\n");
                answer.append("a=ice-pwd:placeholder\r\n");
                answer.append("a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00\r\n");
                answer.append("a=setup:active\r\n");
                answer.append("a=mid:").append(audioMid != null ? audioMid : "0").append("\r\n");
                answer.append("a=").append(answerAudioDirection).append("\r\n");
                answer.append("a=rtcp-mux\r\n");
                answer.append("a=rtpmap:111 opus/48000/2\r\n");
            }
            
            // Add datachannel m-line if present in offer
            if (hasDataChannel) {
                answer.append("m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n");
                answer.append("c=IN IP4 0.0.0.0\r\n");
                answer.append("a=ice-ufrag:placeholder\r\n");
                answer.append("a=ice-pwd:placeholder\r\n");
                answer.append("a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00\r\n");
                answer.append("a=setup:active\r\n");
                answer.append("a=mid:").append(datachannelMid != null ? datachannelMid : "1").append("\r\n");
                answer.append("a=").append(answerDataChannelDirection).append("\r\n");
                answer.append("a=sctp-port:5000\r\n");
                answer.append("a=max-message-size:1073741823\r\n");
            }
            
            return answer.toString();
        }
        
        /**
         * Invert SDP direction attribute for answer
         * sendrecv → sendrecv (both sides send and receive)
         * sendonly → recvonly (if offer sends only, answer receives only)
         * recvonly → sendonly (if offer receives only, answer sends only)
         * inactive → inactive
         */
        private String invertDirection(String direction) {
            switch (direction) {
                case "sendonly":
                    return "recvonly";
                case "recvonly":
                    return "sendonly";
                case "sendrecv":
                    return "sendrecv";
                case "inactive":
                    return "inactive";
                default:
                    return "sendrecv";
            }
        }
    }
}
