package com.hytale.voicechat.plugin.network;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.packet.AudioPacket;
import com.hytale.voicechat.common.packet.AuthenticationPacket;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.DatagramPacket;
import io.netty.channel.socket.nio.NioDatagramChannel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.net.InetSocketAddress;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages UDP socket connections for voice data
 */
public class UDPSocketManager {
    private static final Logger logger = LoggerFactory.getLogger(UDPSocketManager.class);
    
    private final int port;
    private final Map<UUID, InetSocketAddress> clients;
    private final Map<String, UUID> usernameToUUID; // username -> client UUID mapping
    private PlayerPositionTracker positionTracker;
    private EventLoopGroup group;
    private Channel channel;

    public UDPSocketManager(int port) {
        this.port = port;
        this.clients = new ConcurrentHashMap<>();
        this.usernameToUUID = new ConcurrentHashMap<>();
    }
    
    public void setPositionTracker(PlayerPositionTracker tracker) {
        this.positionTracker = tracker;
    }

    public void start() throws InterruptedException {
        group = new NioEventLoopGroup();
        
        Bootstrap bootstrap = new Bootstrap()
                .group(group)
                .channel(NioDatagramChannel.class)
                .option(ChannelOption.SO_BROADCAST, true)
                .handler(new ChannelInitializer<NioDatagramChannel>() {
                    @Override
                    protected void initChannel(NioDatagramChannel ch) {
                        ch.pipeline().addLast(new VoicePacketHandler(clients, usernameToUUID, positionTracker));
                    }
                });

        channel = bootstrap.bind(port).sync().channel();
        logger.info("UDP socket listening on port {}", port);
    }

    public void stop() {
        if (channel != null) {
            channel.close();
        }
        if (group != null) {
            group.shutdownGracefully();
        }
        logger.info("UDP socket stopped");
    }

    private static class VoicePacketHandler extends SimpleChannelInboundHandler<DatagramPacket> {
        private static final Logger logger = LoggerFactory.getLogger(VoicePacketHandler.class);
        private final Map<UUID, InetSocketAddress> clients;
        private final Map<String, UUID> usernameToUUID;
        private final PlayerPositionTracker positionTracker;

        public VoicePacketHandler(Map<UUID, InetSocketAddress> clients, 
                                  Map<String, UUID> usernameToUUID,
                                  PlayerPositionTracker positionTracker) {
            this.clients = clients;
            this.usernameToUUID = usernameToUUID;
            this.positionTracker = positionTracker;
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, DatagramPacket packet) {
            ByteBuf buf = packet.content();
            byte[] data = new byte[buf.readableBytes()];
            buf.readBytes(data);

            try {
                // Check packet type (first byte)
                if (data.length < 1) {
                    return;
                }
                
                byte packetType = data[0];
                
                switch (packetType) {
                    case 0x01: // Authentication packet
                        handleAuthentication(ctx, data, packet.sender());
                        break;
                    case 0x02: // Audio packet
                        handleAudio(ctx, data, packet.sender());
                        break;
                    default:
                        logger.warn("Unknown packet type: {}", packetType);
                }
                
            } catch (Exception e) {
                logger.error("Error processing voice packet", e);
            }
        }
        
        private void handleAuthentication(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender) {
            try {
                AuthenticationPacket authPacket = AuthenticationPacket.deserialize(data);
                UUID clientId = authPacket.getSenderId();
                String username = authPacket.getUsername();
                
                // Register client
                clients.put(clientId, sender);
                usernameToUUID.put(username, clientId);
                
                logger.info("Client authenticated: {} (UUID: {}) from {}", username, clientId, sender);
                
                // TODO: Send acknowledgment packet back to client
                
            } catch (Exception e) {
                logger.error("Error handling authentication", e);
            }
        }
        
        private void handleAudio(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender) {
            try {
                AudioPacket audioPacket = AudioPacket.deserialize(data);
                UUID senderId = audioPacket.getSenderId();
                
                // Verify client is registered
                if (!clients.containsKey(senderId)) {
                    logger.warn("Received audio from unregistered client: {}", senderId);
                    return;
                }
                
                // Route packet based on proximity
                routePacket(ctx, audioPacket, sender);
                
            } catch (Exception e) {
                logger.error("Error handling audio packet", e);
            }
        }

        private void routePacket(ChannelHandlerContext ctx, AudioPacket packet, InetSocketAddress sender) {
            if (positionTracker == null) {
                // No position tracking - broadcast to all
                broadcastToAll(ctx, packet, sender);
                return;
            }
            
            UUID senderId = packet.getSenderId();
            PlayerPosition senderPos = positionTracker.getPlayerPosition(senderId);
            
            if (senderPos == null) {
                return; // Sender not in game
            }
            
            // Route to nearby players only
            byte[] data = packet.serialize();
            ByteBuf buf = ctx.alloc().buffer(data.length);
            buf.writeBytes(data);
            
            Map<UUID, PlayerPosition> allPlayers = positionTracker.getPlayerPositions();
            allPlayers.forEach((uuid, position) -> {
                if (!uuid.equals(senderId)) { // Don't send to self
                    double distance = senderPos.distanceTo(position);
                    
                    // Only send if within proximity distance (30 blocks default)
                    if (distance <= 30.0) {
                        InetSocketAddress clientAddr = clients.get(uuid);
                        if (clientAddr != null) {
                            ctx.writeAndFlush(new DatagramPacket(buf.copy(), clientAddr));
                        }
                    }
                }
            });
            
            buf.release();
        }
        
        private void broadcastToAll(ChannelHandlerContext ctx, AudioPacket packet, InetSocketAddress sender) {
            byte[] data = packet.serialize();
            ByteBuf buf = ctx.alloc().buffer(data.length);
            buf.writeBytes(data);
            
            clients.forEach((uuid, address) -> {
                if (!address.equals(sender)) {
                    ctx.writeAndFlush(new DatagramPacket(buf.copy(), address));
                }
            });
            
            buf.release();
        }
    }
}
