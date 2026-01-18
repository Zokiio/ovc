package com.hytale.voicechat.plugin.network;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.packet.AudioPacket;
import com.hytale.voicechat.common.packet.AuthAckPacket;
import com.hytale.voicechat.common.packet.AuthenticationPacket;
import com.hytale.voicechat.plugin.listener.PlayerEventListener;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.logger.HytaleLogger;
import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.DatagramPacket;
import io.netty.channel.socket.nio.NioDatagramChannel;

import java.net.InetSocketAddress;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages UDP socket connections for voice data
 */
public class UDPSocketManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
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
        logger.atInfo().log("═══════════════════════════════════════════════════════════════");
        logger.atInfo().log("  VOICE SERVER STARTED");
        logger.atInfo().log("  UDP Port: " + port);
        logger.atInfo().log("  Proximity Range: 30 blocks");
        logger.atInfo().log("  Ready for connections...");
        logger.atInfo().log("═══════════════════════════════════════════════════════════════");
    }

    public void stop() {
        if (channel != null) {
            channel.close();
        }
        if (group != null) {
            group.shutdownGracefully();
        }
        
        int connectedClients = clients.size();
        logger.atInfo().log("═══════════════════════════════════════════════════════════════");
        logger.atInfo().log("  VOICE SERVER STOPPED");
        logger.atInfo().log("  Disconnected " + connectedClients + " client(s)");
        logger.atInfo().log("═══════════════════════════════════════════════════════════════");
    }

    private static class VoicePacketHandler extends SimpleChannelInboundHandler<DatagramPacket> {
        private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
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
                    case 0x02: // Audio packet (positional routing)
                        handleAudio(ctx, data, packet.sender(), false);
                        break;
                    case 0x05: // Test audio broadcast (non-positional)
                        handleAudio(ctx, data, packet.sender(), true);
                        break;
                    case 0x04: // Disconnect packet
                        handleDisconnect(ctx, data, packet.sender());
                        break;
                    default:
                        logger.atWarning().log("Unknown packet type: " + packetType);
                }
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error processing voice packet");
            }
        }
        
        private void handleAuthentication(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender) {
            try {
                AuthenticationPacket authPacket = AuthenticationPacket.deserialize(data);
                UUID clientId = authPacket.getSenderId();
                String username = authPacket.getUsername();
                
                // Check if this client ID is already connected from a different address
                InetSocketAddress existingAddr = clients.get(clientId);
                if (existingAddr != null && !existingAddr.equals(sender)) {
                    logger.atInfo().log("Client " + clientId + " reconnecting from new address, removing old connection");
                    // Old connection will be replaced
                }
                
                // Check if this username is already connected with a different client ID
                UUID existingClientId = usernameToClientUUID.get(username);
                if (existingClientId != null && !existingClientId.equals(clientId)) {
                    logger.atInfo().log("Username '" + username + "' already connected with different client ID, removing old connection");
                    // Remove old client mappings
                    clients.remove(existingClientId);
                    clientToPlayerUUID.remove(existingClientId);
                }
                
                // Register client
                clients.put(clientId, sender);
                usernameToClientUUID.put(username, clientId);
                
                // Try to link to Hytale player UUID
                UUID playerUUID = null;
                if (positionTracker != null) {
                    playerUUID = positionTracker.getPlayerUUIDByUsername(username);
                }
                
                if (playerUUID != null) {
                    clientToPlayerUUID.put(clientId, playerUUID);
                    logger.atInfo().log("╔══════════════════════════════════════════════════════════════");
                    logger.atInfo().log("║ VOICE CLIENT CONNECTED");
                    logger.atInfo().log("║ Username: " + username);
                    logger.atInfo().log("║ Client UUID: " + clientId);
                    logger.atInfo().log("║ Player UUID: " + playerUUID);
                    logger.atInfo().log("║ Address: " + sender);
                    logger.atInfo().log("║ Total clients: " + clients.size());
                    logger.atInfo().log("╚══════════════════════════════════════════════════════════════");
                } else {
                    logger.atWarning().log("╔══════════════════════════════════════════════════════════════");
                    logger.atWarning().log("║ VOICE CLIENT CONNECTED (Player not in game)");
                    logger.atWarning().log("║ Username: " + username);
                    logger.atWarning().log("║ Client UUID: " + clientId);
                    logger.atWarning().log("║ Address: " + sender);
                    logger.atWarning().log("║ Status: Player '" + username + "' not found on server");
                    logger.atWarning().log("║ Total clients: " + clients.size());
                    logger.atWarning().log("╚══════════════════════════════════════════════════════════════");
                }
                
                // Send acknowledgment packet back to client
                sendAuthAck(ctx, clientId, sender, true, "Authentication accepted");
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error handling authentication");
            }
        }
        
        private void handleDisconnect(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender) {
            try {
                if (data.length < 17) {
                    logger.atWarning().log("Invalid disconnect packet size: " + data.length);
                    return;
                }
                
                // Extract client UUID (bytes 1-16)
                byte[] uuidBytes = new byte[16];
                System.arraycopy(data, 1, uuidBytes, 0, 16);
                UUID clientId = bytesToUUID(uuidBytes);
                
                // Verify the disconnect is from the registered address
                InetSocketAddress registered = clients.get(clientId);
                if (registered == null) {
                    logger.atFine().log("Disconnect from unknown client: " + clientId);
                    return;
                }
                
                if (!registered.equals(sender)) {
                    logger.atWarning().log("Ignoring spoofed disconnect for " + clientId + " from " + sender);
                    return;
                }
                
                // Find and remove username mapping
                String disconnectedUsername = null;
                for (Map.Entry<String, UUID> entry : usernameToClientUUID.entrySet()) {
                    if (entry.getValue().equals(clientId)) {
                        disconnectedUsername = entry.getKey();
                        break;
                    }
                }
                
                // Remove all mappings for this client
                clients.remove(clientId);
                clientToPlayerUUID.remove(clientId);
                if (disconnectedUsername != null) {
                    usernameToClientUUID.remove(disconnectedUsername);
                }
                
                logger.atInfo().log("╔══════════════════════════════════════════════════════════════");
                logger.atInfo().log("║ VOICE CLIENT DISCONNECTED");
                logger.atInfo().log("║ Username: " + (disconnectedUsername != null ? disconnectedUsername : "unknown"));
                logger.atInfo().log("║ Client UUID: " + clientId);
                logger.atInfo().log("║ Address: " + sender);
                logger.atInfo().log("║ Remaining clients: " + clients.size());
                logger.atInfo().log("╚══════════════════════════════════════════════════════════════");
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error handling disconnect");
            }
        }
        
        private UUID bytesToUUID(byte[] bytes) {
            long msb = 0;
            long lsb = 0;
            for (int i = 0; i < 8; i++) {
                msb = (msb << 8) | (bytes[i] & 0xff);
            }
            for (int i = 8; i < 16; i++) {
                lsb = (lsb << 8) | (bytes[i] & 0xff);
            }
            return new UUID(msb, lsb);
        }
        
        private void handleAudio(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender, boolean forceBroadcast) {
            try {
                AudioPacket audioPacket = AudioPacket.deserialize(data);
                UUID senderId = audioPacket.getSenderId();

                // Verify client is registered; attempt to heal only if address matches an existing client
                InetSocketAddress registered = clients.get(senderId);
                if (registered == null) {
                    UUID addressMatch = findClientByAddress(sender);
                    if (addressMatch != null) {
                        logger.atWarning().log("Received audio with mismatched UUID " + senderId + " from " + sender + "; treating as " + addressMatch);
                        senderId = addressMatch;
                        registered = clients.get(addressMatch);
                        audioPacket = cloneWithSender(audioPacket, addressMatch);
                    } else {
                        logger.atWarning().log("Received audio from unregistered client: " + senderId + " at " + sender + " (clients=" + clients.size() + ")");
                        return;
                    }
                }

                // If the address changed (e.g., NAT rebinding), update the mapping only for the known clientId
                if (!registered.equals(sender)) {
                    logger.atInfo().log("Updating client " + senderId + " address from " + registered + " to " + sender);
                    clients.put(senderId, sender);
                    registered = sender;
                }
                
                if (forceBroadcast || positionTracker == null) {
                    broadcastToAll(ctx, audioPacket, sender);
                } else {
                    // Route packet based on proximity
                    routePacket(ctx, audioPacket, sender);
                }
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error handling audio packet");
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
                // Try to resolve lazily from username mapping if the player joined after voice auth
                String username = findUsernameByClientId(clientId);
                if (username != null) {
                    playerUUID = positionTracker.getPlayerUUIDByUsername(username);
                    if (playerUUID != null) {
                        clientToPlayerUUID.put(clientId, playerUUID);
                        logger.atFine().log("Linked voice client " + clientId + " to player " + playerUUID + " (" + username + ")");
                    }
                }
            }
            if (playerUUID == null) {
                logger.atFine().log("Voice client " + clientId + " not linked to player - broadcasting to all");
                broadcastToAll(ctx, packet, sender);
                return;
            }
            
            // Get sender's position
            PlayerPosition senderPos = positionTracker.getPlayerPosition(playerUUID);
            if (senderPos == null) {
                logger.atFine().log("Player " + playerUUID + " position not found - broadcasting to all");
                broadcastToAll(ctx, packet, sender);
                return; // Sender not in game / not tracked yet
            }
            
            // Route to nearby players only
            AudioPacket enriched = enrichWithPosition(packet, senderPos);
            byte[] data = enriched.serialize();
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
            
            if (routedCount > 0) {
                logger.atFine().log("▶ Audio routed from " + senderPos.getPlayerName() + " to " + routedCount + " nearby player(s)");
            }
            
            buf.release();
        }

        private AudioPacket enrichWithPosition(AudioPacket packet, PlayerPosition senderPos) {
            if (senderPos == null) {
                return packet;
            }
            return new AudioPacket(packet.getSenderId(), packet.getCodec(), packet.getAudioData(), packet.getSequenceNumber(),
                    (float) senderPos.getX(), (float) senderPos.getY(), (float) senderPos.getZ());
        }
        
        private UUID findClientByPlayerUUID(UUID playerUUID) {
            for (Map.Entry<UUID, UUID> entry : clientToPlayerUUID.entrySet()) {
                if (entry.getValue().equals(playerUUID)) {
                    return entry.getKey();
                }
            }
            return null;
        }

        private String findUsernameByClientId(UUID clientId) {
            for (Map.Entry<String, UUID> entry : usernameToClientUUID.entrySet()) {
                if (entry.getValue().equals(clientId)) {
                    return entry.getKey();
                }
            }
            return null;
        }

        private UUID findClientByAddress(InetSocketAddress address) {
            for (Map.Entry<UUID, InetSocketAddress> entry : clients.entrySet()) {
                if (entry.getValue().equals(address)) {
                    return entry.getKey();
                }
            }
            return null;
        }

        private AudioPacket cloneWithSender(AudioPacket packet, UUID senderId) {
            if (packet.hasPosition()) {
                return new AudioPacket(senderId, packet.getCodec(), packet.getAudioData(), packet.getSequenceNumber(),
                        packet.getPosX(), packet.getPosY(), packet.getPosZ());
            }
            return new AudioPacket(senderId, packet.getCodec(), packet.getAudioData(), packet.getSequenceNumber());
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
        
        private void sendAuthAck(ChannelHandlerContext ctx, UUID clientId, InetSocketAddress address, 
                                 boolean accepted, String message) {
            try {
                AuthAckPacket ackPacket = new AuthAckPacket(clientId, accepted, message);
                byte[] data = ackPacket.serialize();
                ByteBuf buf = ctx.alloc().buffer(data.length);
                buf.writeBytes(data);
                ctx.writeAndFlush(new DatagramPacket(buf, address));
                logger.atFine().log("Sent authentication acknowledgment to " + address);
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error sending authentication acknowledgment");
            }
        }
    }
}
