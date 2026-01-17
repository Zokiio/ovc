package com.hytale.voicechat.plugin.network;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.packet.AudioPacket;
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
    private PlayerPositionTracker positionTracker;
    private EventLoopGroup group;
    private Channel channel;

    public UDPSocketManager(int port) {
        this.port = port;
        this.clients = new ConcurrentHashMap<>();
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
                        ch.pipeline().addLast(new VoicePacketHandler(clients, positionTracker));
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
        private final Map<UUID, InetSocketAddress> clients;
        private final PlayerPositionTracker positionTracker;

        public VoicePacketHandler(Map<UUID, InetSocketAddress> clients, PlayerPositionTracker positionTracker) {
            this.clients = clients;
            this.positionTracker = positionTracker;
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, DatagramPacket packet) {
            ByteBuf buf = packet.content();
            byte[] data = new byte[buf.readableBytes()];
            buf.readBytes(data);

            try {
                AudioPacket audioPacket = AudioPacket.deserialize(data);
                UUID senderId = audioPacket.getSenderId();
                
                // Register client address
                clients.put(senderId, packet.sender());
                
                // Route packet based on proximity
                routePacket(ctx, audioPacket, packet.sender());
                
            } catch (Exception e) {
                logger.error("Error processing voice packet", e);
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
