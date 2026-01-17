package com.hytale.voicechat.plugin.network;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.packet.AudioPacket;
import com.hytale.voicechat.common.packet.AuthenticationPacket;
import com.hytale.voicechat.plugin.listener.PlayerEventListener;
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
    private final Map<String, UUID> usernameToClientUUID; // username -> voice client UUID
    private final Map<UUID, UUID> clientToPlayerUUID; // voice client UUID -> Hytale player UUID
    private PlayerPositionTracker positionTracker;
    private PlayerEventListener eventListener;
    private EventLoopGroup group;
    private Channel channel;

    public UDPSocketManager(int port) {
        this.port = port;
        this.clients = new ConcurrentHashMap<>();
        this.usernameToClientUUID = new ConcurrentHashMap<>();
        this.clientToPlayerUUID = new ConcurrentHashMap<>();
    }
    
    public void setPositionTracker(PlayerPositionTracker tracker) {
        this.positionTracker = tracker;
    }
    
    public void setEventListener(PlayerEventListener listener) {
        this.eventListener = listener;
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
                        ch.pipeline().addLast(new VoicePacketHandler(
                            clients, 
                            usernameToClientUUID, 
                            clientToPlayerUUID,
                            positionTracker,
                            eventListener
                        ));
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
        private final Map<String, UUID> usernameToClientUUID;
        private final Map<UUID, UUID> clientToPlayerUUID;
        private final PlayerPositionTracker positionTracker;
        private final PlayerEventListener eventListener;

        public VoicePacketHandler(Map<UUID, InetSocketAddress> clients, 
                                  Map<String, UUID> usernameToClientUUID,
                                  Map<UUID, UUID> clientToPlayerUUID,
                                  PlayerPositionTracker positionTracker,
                                  PlayerEventListener eventListener) {
            this.clients = clients;
            this.usernameToClientUUID = usernameToClientUUID;
            this.clientToPlayerUUID = clientToPlayerUUID;
            this.positionTracker = positionTracker;
            this.eventListener = eventListener;
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
                usernameToClientUUID.put(username, clientId);
                
                // Try to link to Hytale player UUID
                if (eventListener != null) {
                    UUID playerUUID = eventListener.getPlayerUUID(username);
                    if (playerUUID != null) {
                        clientToPlayerUUID.put(clientId, playerUUID);
                        logger.info("Client authenticated: {} (client UUID: {}, player UUID: {}) from {}", 
                            username, clientId, playerUUID, sender);
                    } else {
                        logger.warn("Client authenticated: {} (client UUID: {}) from {} - Player not in game!", 
                            username, clientId, sender);
                    }
                } else {
                    logger.info("Client authenticated: {} (UUID: {}) from {}", username, clientId, sender);
                }
                
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
            
            UUID clientId = packet.getSenderId(); // Voice client UUID
            
            // Get Hytale player UUID from voice client UUID
            UUID playerUUID = clientToPlayerUUID.get(clientId);
            if (playerUUID == null) {
                logger.debug("Voice client {} not linked to player - broadcasting to all", clientId);
                broadcastToAll(ctx, packet, sender);
                return;
            }
            
            // Get sender's position
            PlayerPosition senderPos = positionTracker.getPlayerPosition(playerUUID);
            if (senderPos == null) {
                logger.debug("Player {} position not found", playerUUID);
                return; // Sender not in game
            }
            
            // Route to nearby players only
            byte[] data = packet.serialize();
            ByteBuf buf = ctx.alloc().buffer(data.length);
            buf.writeBytes(data);
            
            int routedCount = 0;
            Map<UUID, PlayerPosition> allPlayers = positionTracker.getPlayerPositions();
            
            for (Map.Entry<UUID, PlayerPosition> entry : allPlayers.entrySet()) {
                UUID otherPlayerUUID = entry.getKey();
                PlayerPosition position = entry.getValue();
                
                if (!otherPlayerUUID.equals(playerUUID)) { // Don't send to self
                    double distance = senderPos.distanceTo(position);
                    
                    // Only send if within proximity distance (30 blocks default)
                    if (distance <= 30.0) {
                        // Find voice client for this player
                        UUID otherClientId = findClientByPlayerUUID(otherPlayerUUID);
                        if (otherClientId != null) {
                            InetSocketAddress clientAddr = clients.get(otherClientId);
                            if (clientAddr != null) {
                                ctx.writeAndFlush(new DatagramPacket(buf.copy(), clientAddr));
                                routedCount++;
                            }
                        }
                    }
                }
            }
            
            logger.debug("Routed audio from {} to {} nearby players", senderPos.getPlayerName(), routedCount);
            buf.release();
        }
        
        private UUID findClientByPlayerUUID(UUID playerUUID) {
            for (Map.Entry<UUID, UUID> entry : clientToPlayerUUID.entrySet()) {
                if (entry.getValue().equals(playerUUID)) {
                    return entry.getKey();
                }
            }
            return null;
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
