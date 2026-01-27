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
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;
    
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
            logger.atInfo().log("WebRTC signaling server started on port {}", port);
        } catch (Exception e) {
            logger.atSevere().log("Failed to start WebRTC signaling server", e);
            shutdown();
            throw e;
        }
    }
    
    public void shutdown() {
        logger.atInfo().log("Shutting down WebRTC signaling server");
        
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
                    case SignalingMessage.TYPE_OFFER:
                        handleOffer(ctx, message);
                        break;
                    case SignalingMessage.TYPE_ICE_CANDIDATE:
                        handleIceCandidate(ctx, message);
                        break;
                    case SignalingMessage.TYPE_DISCONNECT:
                        handleDisconnect(ctx);
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
            
            // Create new client
            UUID clientId = UUID.randomUUID();
            WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
            clients.put(clientId, client);
            ctx.channel().attr(CLIENT_ATTR).set(client);
            
            // Add to position tracker with default position (0, 0, 0)
            // Position will be updated when player joins the game
            if (positionTracker != null) {
                PlayerPosition position = new PlayerPosition(clientId, username, 0, 0, 0, 0, 0, "overworld");
                positionTracker.addPlayer(position);
                logger.atInfo().log("Added WebRTC client to position tracker: {}", username);
            }
            
            // Send success response
            JsonObject responseData = new JsonObject();
            responseData.addProperty("clientId", clientId.toString());
            responseData.addProperty("username", username);
            
            SignalingMessage response = new SignalingMessage(
                    SignalingMessage.TYPE_AUTH_SUCCESS, responseData);
            sendMessage(ctx, response);
            
            logger.atInfo().log("WebRTC client authenticated: {} ({})", username, clientId);
        }
        
        private void handleOffer(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            
            JsonObject data = message.getData();
            String sdp = data.get("sdp").getAsString();
            
            // In a real implementation, we would process the SDP offer
            // and create an SDP answer using a WebRTC library
            // For now, we'll send a placeholder response
            JsonObject answerData = new JsonObject();
            answerData.addProperty("sdp", createAnswerSdp(sdp));
            answerData.addProperty("type", "answer");
            
            SignalingMessage answer = new SignalingMessage(
                    SignalingMessage.TYPE_ANSWER, answerData);
            sendMessage(ctx, answer);
            
            logger.atFine().log("Sent SDP answer to client {}", client.getClientId());
        }
        
        private void handleIceCandidate(ChannelHandlerContext ctx, SignalingMessage message) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client == null) {
                sendError(ctx, "Not authenticated");
                return;
            }
            
            logger.atFine().log("Received ICE candidate from client {}", client.getClientId());
            
            // In a real implementation, we would process the ICE candidate
            // For now, we just acknowledge it
        }
        
        private void handleDisconnect(ChannelHandlerContext ctx) {
            WebRTCClient client = ctx.channel().attr(CLIENT_ATTR).get();
            if (client != null) {
                // Remove from position tracker
                if (positionTracker != null) {
                    positionTracker.removePlayer(client.getClientId());
                    logger.atInfo().log("Removed WebRTC client from position tracker: {}", client.getUsername());
                }
                clients.remove(client.getClientId());
                logger.atInfo().log("WebRTC client disconnected: {}", client.getUsername());
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
         * Create a placeholder SDP answer
         * In a real implementation, this would use a WebRTC library to generate a proper answer
         */
        private String createAnswerSdp(String offerSdp) {
            // This is a placeholder - a real implementation would need a WebRTC library
            // like webrtc-java or jitsi-webrtc to properly process the offer and create an answer
            return "v=0\r\n" +
                   "o=- 0 0 IN IP4 0.0.0.0\r\n" +
                   "s=Hytale Voice Chat\r\n" +
                   "t=0 0\r\n" +
                   "a=group:BUNDLE audio\r\n" +
                   "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" +
                   "c=IN IP4 0.0.0.0\r\n" +
                   "a=rtcp:9 IN IP4 0.0.0.0\r\n" +
                   "a=ice-ufrag:placeholder\r\n" +
                   "a=ice-pwd:placeholder\r\n" +
                   "a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00\r\n" +
                   "a=setup:active\r\n" +
                   "a=mid:audio\r\n" +
                   "a=sendrecv\r\n" +
                   "a=rtcp-mux\r\n" +
                   "a=rtpmap:111 opus/48000/2\r\n";
        }
    }
}
