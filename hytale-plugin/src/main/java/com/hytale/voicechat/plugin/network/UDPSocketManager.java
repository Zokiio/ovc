package com.hytale.voicechat.plugin.network;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.model.Group;
import com.hytale.voicechat.common.packet.AudioPacket;
import com.hytale.voicechat.common.packet.AuthAckPacket;
import com.hytale.voicechat.common.packet.AuthenticationPacket;
import com.hytale.voicechat.common.packet.GroupManagementPacket;
import com.hytale.voicechat.common.packet.GroupStatePacket;
import com.hytale.voicechat.common.packet.GroupListPacket;
import com.hytale.voicechat.common.packet.PlayerNamePacket;
import com.hytale.voicechat.common.packet.ServerShutdownPacket;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.plugin.listener.PlayerEventListener;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.Message;
import com.hypixel.hytale.server.core.entity.entities.Player;
// Removed direct EntityStore/PlayerRef querying for player validation; rely on tracker
import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.DatagramPacket;
import io.netty.channel.socket.nio.NioDatagramChannel;
import io.netty.channel.SimpleChannelInboundHandler;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages UDP socket connections for voice data
 */
public class UDPSocketManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final UUID SERVER_UUID = new UUID(0L, 0L); // Dedicated server identifier
    
    private final int port;
    private volatile double proximityDistance = NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;
    private final Map<UUID, InetSocketAddress> clients;
    private final Map<String, UUID> usernameToClientUUID; // username -> voice client UUID
    private final Map<UUID, UUID> clientToPlayerUUID; // voice client UUID -> Hytale player UUID
    private final Map<UUID, UUID> playerToClientUUID; // Hytale player UUID -> voice client UUID (reverse lookup)
    private final Map<UUID, Integer> clientSampleRates; // voice client UUID -> negotiated sample rate
    private final Map<UUID, Integer> playerUUIDToHashId; // Hytale player UUID -> hash ID (for routing)
    private final Map<Integer, UUID> hashIdToPlayerUUID; // hash ID -> Hytale player UUID (reverse lookup)
    private final Map<Integer, String> hashIdToUsername; // hash ID -> username (for PlayerNamePacket)
    private PlayerPositionTracker positionTracker;
    private PlayerEventListener eventListener;
    private volatile GroupManager groupManager;
    private EventLoopGroup group;
    private Channel channel;

    public UDPSocketManager(int port) {
        this.port = port;
        this.clients = new ConcurrentHashMap<>();
        this.usernameToClientUUID = new ConcurrentHashMap<>();
        this.clientToPlayerUUID = new ConcurrentHashMap<>();
        this.playerToClientUUID = new ConcurrentHashMap<>();
        this.clientSampleRates = new ConcurrentHashMap<>();
        this.playerUUIDToHashId = new ConcurrentHashMap<>();
        this.hashIdToPlayerUUID = new ConcurrentHashMap<>();
        this.hashIdToUsername = new ConcurrentHashMap<>();
    }

    public void setProximityDistance(double proximityDistance) {
        this.proximityDistance = proximityDistance;
    }
    
    public void setPositionTracker(PlayerPositionTracker tracker) {
        this.positionTracker = tracker;
    }
    
    public void setEventListener(PlayerEventListener listener) {
        this.eventListener = listener;
    }
    
    public void setGroupManager(GroupManager manager) {
        this.groupManager = manager;
    }
    
    // EntityStore not needed for current validation; using PlayerPositionTracker

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
                            playerToClientUUID,
                            clientSampleRates,
                            playerUUIDToHashId,
                            hashIdToPlayerUUID,
                            hashIdToUsername,
                            positionTracker,
                            eventListener,
                            groupManager
                        ));
                    }
                });

        channel = bootstrap.bind(port).sync().channel();
        logger.atInfo().log("═══════════════════════════════════════════════════════════════");
        logger.atInfo().log("  VOICE SERVER STARTED");
        logger.atInfo().log("  UDP Port: " + port);
        logger.atInfo().log("  Proximity Range: " + proximityDistance + " blocks");
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

    /**
     * Broadcast shutdown notification to all connected clients
     */
    public void broadcastShutdown(String reason) {
        if (clients.isEmpty()) {
            logger.atInfo().log("No clients connected, skipping shutdown broadcast");
            return;
        }
        
        ServerShutdownPacket shutdownPacket = new ServerShutdownPacket(reason);
        byte[] data = shutdownPacket.serialize();
        
        logger.atInfo().log("Broadcasting shutdown notification to " + clients.size() + " client(s)");
        for (InetSocketAddress address : clients.values()) {
            try {
                if (channel != null && channel.isOpen()) {
                    ByteBuf buf = channel.alloc().buffer(data.length);
                    buf.writeBytes(data);
                    channel.writeAndFlush(new DatagramPacket(buf, address));
                }
            } catch (Exception e) {
                logger.atFine().log("Error sending shutdown packet to " + address + ": " + e.getMessage());
            }
        }
    }

    /**
     * Disconnect a voice client associated with a player that quit
     * @param playerUuid The Hytale player UUID that quit
     */
    public void disconnectPlayerVoiceClient(UUID playerUuid) {
        UUID clientUuid = playerToClientUUID.remove(playerUuid);
        if (clientUuid == null) {
            logger.atFine().log("Player " + playerUuid + " had no voice client connected");
            return;
        }
        
        // Get the client's address
        InetSocketAddress clientAddress = clients.get(clientUuid);
        if (clientAddress == null) {
            logger.atFine().log("Client address not found for voice client " + clientUuid);
            return;
        }
        
        // Remove from all tracking maps
        clients.remove(clientUuid);
        clientToPlayerUUID.remove(clientUuid);
        clientSampleRates.remove(clientUuid);
        
        // Clean up hash ID mappings
        Integer hashId = playerUUIDToHashId.remove(playerUuid);
        if (hashId != null) {
            hashIdToPlayerUUID.remove(hashId);
            hashIdToUsername.remove(hashId);
        }
        
        // Find and remove username mapping
        String username = null;
        for (Map.Entry<String, UUID> entry : usernameToClientUUID.entrySet()) {
            if (entry.getValue().equals(clientUuid)) {
                username = entry.getKey();
                break;
            }
        }
        if (username != null) {
            usernameToClientUUID.remove(username);
        }
        
        // Send shutdown packet to the disconnected client
        ServerShutdownPacket shutdownPacket = new ServerShutdownPacket("Your player account logged out");
        byte[] data = shutdownPacket.serialize();
        
        try {
            if (channel != null && channel.isOpen()) {
                ByteBuf buf = channel.alloc().buffer(data.length);
                buf.writeBytes(data);
                channel.writeAndFlush(new DatagramPacket(buf, clientAddress));
                logger.atInfo().log("Sent disconnect notification to voice client " + clientUuid + " (player " + playerUuid + ")");
            }
        } catch (Exception e) {
            logger.atFine().log("Error sending disconnect packet to " + clientAddress + ": " + e.getMessage());
        }
    }

    // Player UUID validation is handled via PlayerPositionTracker presence

    /**
     * Check if a player has an active voice client connection
     * @param playerUuid The Hytale player UUID
     * @return true if the player has an authenticated voice client
     */
    public boolean isPlayerConnected(UUID playerUuid) {
        return playerToClientUUID.containsKey(playerUuid);
    }

    private class VoicePacketHandler extends SimpleChannelInboundHandler<DatagramPacket> {
        private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
        private final Map<UUID, InetSocketAddress> clients;
        private final Map<String, UUID> usernameToClientUUID;
        private final Map<UUID, UUID> clientToPlayerUUID;
        private final Map<UUID, UUID> playerToClientUUID;
        private final Map<UUID, Integer> clientSampleRates;
        private final Map<UUID, Integer> playerUUIDToHashId;
        private final Map<Integer, UUID> hashIdToPlayerUUID;
        private final Map<Integer, String> hashIdToUsername;
        private final PlayerPositionTracker positionTracker;
        private final PlayerEventListener eventListener;
        private final GroupManager groupManager;

        public VoicePacketHandler(Map<UUID, InetSocketAddress> clients, 
                                  Map<String, UUID> usernameToClientUUID,
                                  Map<UUID, UUID> clientToPlayerUUID,
                                  Map<UUID, UUID> playerToClientUUID,
                                  Map<UUID, Integer> clientSampleRates,
                                  Map<UUID, Integer> playerUUIDToHashId,
                                  Map<Integer, UUID> hashIdToPlayerUUID,
                                  Map<Integer, String> hashIdToUsername,
                                  PlayerPositionTracker positionTracker,
                                  PlayerEventListener eventListener,
                                  GroupManager groupManager) {
            this.clients = clients;
            this.usernameToClientUUID = usernameToClientUUID;
            this.clientToPlayerUUID = clientToPlayerUUID;
            this.playerToClientUUID = playerToClientUUID;
            this.clientSampleRates = clientSampleRates;
            this.playerUUIDToHashId = playerUUIDToHashId;
            this.hashIdToPlayerUUID = hashIdToPlayerUUID;
            this.hashIdToUsername = hashIdToUsername;
            this.positionTracker = positionTracker;
            this.eventListener = eventListener;
            this.groupManager = groupManager;
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, DatagramPacket packet) throws Exception {
            handlePacket(ctx, packet);
        }

        private void handlePacket(ChannelHandlerContext ctx, DatagramPacket packet) {
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
                    case 0x06: // Group management packet
                        handleGroupManagement(ctx, data, packet.sender());
                        break;
                    case 0x08: // Group list query packet
                        handleGroupListQuery(ctx, data, packet.sender());
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
                int requestedSampleRate = authPacket.getRequestedSampleRate();
                int selectedSampleRate = selectSampleRate(requestedSampleRate);
                
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
                    clientSampleRates.remove(existingClientId);
                    UUID oldPlayerUUID = clientToPlayerUUID.remove(existingClientId);
                    if (oldPlayerUUID != null) {
                        playerToClientUUID.remove(oldPlayerUUID);
                    }
                }
                
                // Try to link to Hytale player UUID
                UUID playerUUID = null;
                if (positionTracker != null) {
                    playerUUID = positionTracker.getPlayerUUIDByUsername(username);
                }
                
                // VALIDATE: Player must exist in-game
                if (playerUUID == null) {
                    logger.atWarning().log("╔══════════════════════════════════════════════════════════════");
                    logger.atWarning().log("║ AUTH REJECTED - Player not in-game");
                    logger.atWarning().log("║ Username: " + username);
                    logger.atWarning().log("║ Client UUID: " + clientId);
                    logger.atWarning().log("║ Address: " + sender);
                    logger.atWarning().log("║ Reason: Player UUID not found in tracker");
                    logger.atWarning().log("╚══════════════════════════════════════════════════════════════");
                    
                    // Send rejection with PLAYER_NOT_FOUND reason
                    sendAuthAck(ctx, clientId, sender, AuthAckPacket.REASON_PLAYER_NOT_FOUND, 
                                "Player not in-game yet. Join the game and try connecting again.", selectedSampleRate);
                    return;
                }
                
                // Player is in-game, accept connection
                clients.put(clientId, sender);
                usernameToClientUUID.put(username, clientId);
                clientToPlayerUUID.put(clientId, playerUUID);
                playerToClientUUID.put(playerUUID, clientId);
                clientSampleRates.put(clientId, selectedSampleRate);
                
                // Generate or reuse hash ID for this player
                int hashId;
                if (playerUUIDToHashId.containsKey(playerUUID)) {
                    // Player already has a hash ID, reuse it
                    hashId = playerUUIDToHashId.get(playerUUID);
                } else {
                    // Generate new hash ID for this player (collision-resistant)
                    hashId = generateHashId(playerUUID);
                    playerUUIDToHashId.put(playerUUID, hashId);
                    hashIdToPlayerUUID.put(hashId, playerUUID);
                    hashIdToUsername.put(hashId, username);
                }
                
                logger.atInfo().log("╔══════════════════════════════════════════════════════════════");
                logger.atInfo().log("║ VOICE CLIENT CONNECTED");
                logger.atInfo().log("║ Username: " + username);
                logger.atInfo().log("║ Client UUID: " + clientId);
                logger.atInfo().log("║ Player UUID: " + playerUUID);
                logger.atInfo().log("║ Hash ID: " + hashId);
                logger.atInfo().log("║ Address: " + sender);
                logger.atInfo().log("║ Sample Rate: " + selectedSampleRate + " Hz");
                logger.atInfo().log("║ Total clients: " + clients.size());
                logger.atInfo().log("╚══════════════════════════════════════════════════════════════");
                
                // Send acceptance packet
                sendAuthAck(ctx, clientId, sender, AuthAckPacket.REASON_ACCEPTED, "Authentication accepted", selectedSampleRate);
                
                // Send PlayerNamePackets to new client for all existing players with voice clients
                sendAllPlayerNames(ctx, sender);
                
                // Broadcast new player's name to all other voice clients
                broadcastPlayerName(ctx, hashId, username, sender);
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error handling authentication");
            }
        }

        private int selectSampleRate(int requestedSampleRate) {
            // Enforce a single sample rate on the server side to avoid codec mismatches.
            // The plugin's OpusCodec operates at NetworkConfig.DEFAULT_SAMPLE_RATE, so we 
            // must ensure all clients use the same rate to prevent audio quality issues 
            // when routing packets between clients with different rates.
            return NetworkConfig.DEFAULT_SAMPLE_RATE;
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
                UUID playerUUID = clientToPlayerUUID.remove(clientId);
                if (playerUUID != null) {
                    playerToClientUUID.remove(playerUUID);
                }
                clientSampleRates.remove(clientId);
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
                        playerToClientUUID.put(playerUUID, clientId);
                        logger.atFine().log("Linked voice client " + clientId + " to player " + playerUUID + " (" + username + ")");
                    }
                }
            }
            if (playerUUID == null) {
                logger.atFine().log("Voice client " + clientId + " not linked to player - broadcasting to all");
                broadcastToAll(ctx, packet, sender);
                return;
            }
            
            // Get sender's hash ID for privacy-preserving audio routing
            Integer senderHashId = playerUUIDToHashId.get(playerUUID);
            if (senderHashId == null) {
                logger.atWarning().log("No hash ID found for player " + playerUUID + " - cannot route audio");
                return;
            }
            
            // Get sender's position
            PlayerPosition senderPos = positionTracker.getPlayerPosition(playerUUID);
            if (senderPos == null) {
                logger.atInfo().log("Positional fallback: no position for player " + playerUUID + " (client=" + clientId + ")");
                broadcastToAll(ctx, packet, sender);
                return; // Sender not in game / not tracked yet
            }
            
            // Route to nearby players and group members
            int routedCount = 0;
            Map<UUID, PlayerPosition> allPlayers = positionTracker.getPlayerPositions();
            int tracked = allPlayers.size();
            
            // Get sender's group (if any) - use local variable for thread safety
            GroupManager localGroupManager = groupManager;
            Group senderGroup = localGroupManager != null ? localGroupManager.getPlayerGroup(playerUUID) : null;
            
            if (senderGroup != null) {
                logger.atFine().log("Routing audio from group " + senderGroup.getName());
            }
            
            // Track which players have received audio to avoid duplicates
            java.util.Set<UUID> routedPlayers = new java.util.HashSet<>();
            
            // First pass: Route to players in position tracker (proximity + group)
            for (Map.Entry<UUID, PlayerPosition> entry : allPlayers.entrySet()) {
                UUID otherPlayerUUID = entry.getKey();
                PlayerPosition position = entry.getValue();
                
                if (!otherPlayerUUID.equals(playerUUID)) { // Don't send to self
                    boolean inSameGroup = senderGroup != null && senderGroup.hasMember(otherPlayerUUID);
                    double distance = senderPos.distanceTo(position);
                    boolean inProximity = distance <= proximityDistance;
                    
                    // Check isolation: if sender is in isolated group, skip non-group players
                    // Check isolation: if receiver is in different isolated group, skip them
                    Group receiverGroup = localGroupManager != null ? localGroupManager.getPlayerGroup(otherPlayerUUID) : null;
                    boolean senderIsIsolated = senderGroup != null && senderGroup.isIsolated();
                    boolean receiverIsIsolated = receiverGroup != null && receiverGroup.isIsolated() && !inSameGroup;
                    
                    if (senderIsIsolated && !inSameGroup) {
                        // Sender is isolated - only route to same group
                        continue;
                    }
                    if (receiverIsIsolated) {
                        // Receiver is in different isolated group - skip
                        continue;
                    }
                    
                    // Send if in same group OR within proximity distance
                    if (inSameGroup || inProximity) {
                        // Find voice client for this player
                        UUID otherClientId = findClientByPlayerUUID(otherPlayerUUID);
                        
                        if (otherClientId != null) {
                            InetSocketAddress clientAddr = clients.get(otherClientId);
                            
                            if (clientAddr != null) {
                                // Priority: proximity audio (spatial 3D) takes precedence over group audio
                                if (inProximity) {
                                    // Proximity audio: send WITH position (spatial 3D)
                                    float dx = (float) (senderPos.getX() - position.getX());
                                    float dy = (float) (senderPos.getY() - position.getY());
                                    float dz = (float) (senderPos.getZ() - position.getZ());

                                    float[] rotated = rotateToListenerFrame(dx, dy, dz, position.getYaw(), position.getPitch());

                                    int packetSize = AudioPacket.getSerializedSizeWithHashId(packet.getAudioData().length, true);
                                    ByteBuf buf = ctx.alloc().buffer(packetSize);
                                    packet.serializeToByteBufWithHashId(buf, senderHashId, rotated[0], rotated[1], rotated[2]);
                                    ctx.writeAndFlush(new DatagramPacket(buf, clientAddr));
                                    routedCount++;
                                    routedPlayers.add(otherPlayerUUID);
                                } else if (inSameGroup) {
                                    // Group audio only (not in proximity) - always non-spatial
                                    int packetSize = AudioPacket.getSerializedSizeWithHashId(packet.getAudioData().length, false);
                                    ByteBuf buf = ctx.alloc().buffer(packetSize);
                                    packet.serializeToByteBufWithHashId(buf, senderHashId, null, null, null);
                                    ctx.writeAndFlush(new DatagramPacket(buf, clientAddr));
                                    routedPlayers.add(otherPlayerUUID);
                                }
                            }
                        }
                    }
                }
            }
            
            // Second pass: Route to group members not in position tracker
            if (senderGroup != null) {
                for (UUID groupMemberId : senderGroup.getMembers()) {
                    if (!groupMemberId.equals(playerUUID) && !routedPlayers.contains(groupMemberId)) {
                        // This group member wasn't in the position tracker
                        UUID otherClientId = findClientByPlayerUUID(groupMemberId);
                        
                        if (otherClientId != null) {
                            InetSocketAddress clientAddr = clients.get(otherClientId);
                            
                            if (clientAddr != null) {
                                // Send WITHOUT position (center-channel, non-spatial)
                                int packetSize = AudioPacket.getSerializedSizeWithHashId(packet.getAudioData().length, false);
                                ByteBuf buf = ctx.alloc().buffer(packetSize);
                                packet.serializeToByteBufWithHashId(buf, senderHashId, null, null, null);
                                ctx.writeAndFlush(new DatagramPacket(buf, clientAddr));
                            }
                        }
                    }
                }
            }
        }
        
        private AudioPacket withRelativePosition(AudioPacket packet, float dx, float dy, float dz) {
            return new AudioPacket(packet.getSenderId(), packet.getCodec(), packet.getAudioData(), packet.getSequenceNumber(), dx, dy, dz);
        }

        private float[] rotateToListenerFrame(float dx, float dy, float dz, double yawDeg, double pitchDeg) {
            double yaw = Math.toRadians(yawDeg);
            double pitch = Math.toRadians(pitchDeg);

            // Yaw: rotate world delta into listener local frame (+Z forward, +X right)
            double cosY = Math.cos(yaw);
            double sinY = Math.sin(yaw);
            double rx = dx * cosY - dz * sinY;
            double rz = -(dx * sinY + dz * cosY);

            // Pitch: rotate around X to account for looking up/down
            double cosP = Math.cos(-pitch);
            double sinP = Math.sin(-pitch);
            double ry = dy * cosP - rz * sinP;
            double rz2 = dy * sinP + rz * cosP;

            return new float[]{(float) rx, (float) ry, (float) rz2};
        }
        
        private UUID findClientByPlayerUUID(UUID playerUUID) {
            // O(1) lookup using reverse mapping
            return playerToClientUUID.get(playerUUID);
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
        
        private void handleGroupManagement(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender) {
            try {
                if (groupManager == null) {
                    logger.atWarning().log("Group management received but GroupManager not initialized");
                    return;
                }
                
                GroupManagementPacket packet = GroupManagementPacket.deserialize(data);
                UUID playerId = packet.getSenderId();
                
                // Get player UUID from voice client UUID
                UUID playerUUID = clientToPlayerUUID.get(playerId);
                if (playerUUID == null) {
                    String username = findUsernameByClientId(playerId);
                    if (username != null && positionTracker != null) {
                        playerUUID = positionTracker.getPlayerUUIDByUsername(username);
                        if (playerUUID != null) {
                            clientToPlayerUUID.put(playerId, playerUUID);
                            playerToClientUUID.put(playerUUID, playerId);
                        }
                    }
                }
                
                if (playerUUID == null) {
                    logger.atWarning().log("Group management from unlinked voice client: " + playerId);
                    return;
                }
                
                Group affectedGroup = null;
                String logMessage = "";
                
                switch (packet.getOperation()) {
                    case CREATE:
                        // Security: Do not allow clients to create permanent groups to avoid resource exhaustion
                        if (packet.isPermanent()) {
                            logger.atWarning().log("Client " + playerUUID + " attempted to create permanent group: " + packet.getGroupName() + " – creating non-permanent group instead");
                        }
                        affectedGroup = groupManager.createGroup(packet.getGroupName(), false, playerUUID);
                        if (affectedGroup != null) {
                            groupManager.joinGroup(playerUUID, affectedGroup.getGroupId());
                            logMessage = "Group created: " + packet.getGroupName();
                        }
                        break;
                    
                    case JOIN:
                        if (groupManager.joinGroup(playerUUID, packet.getGroupId())) {
                            affectedGroup = groupManager.getGroup(packet.getGroupId());
                            logMessage = "Player joined group";
                        }
                        break;
                    
                    case LEAVE:
                        affectedGroup = groupManager.getPlayerGroup(playerUUID);
                        UUID newOwner = groupManager.leaveGroup(playerUUID);
                        if (newOwner != null) {
                            logMessage = "Player left group, ownership transferred to " + newOwner;
                            // Send notification to new owner
                            sendOwnershipTransferNotification(newOwner, affectedGroup.getName());
                        } else if (affectedGroup != null) {
                            logMessage = "Player left group";
                        }
                        break;
                    
                    case UPDATE_SETTINGS:
                        affectedGroup = groupManager.getGroup(packet.getGroupId());
                        if (affectedGroup != null) {
                            boolean success = groupManager.updateGroupSettings(
                                packet.getGroupId(),
                                playerUUID,
                                packet.isIsolated()
                            );
                            if (success) {
                                logMessage = "Group settings updated: isolated=" + packet.isIsolated();
                            } else {
                                logMessage = "Failed to update group settings (permission denied)";
                                affectedGroup = null; // Don't broadcast if permission denied
                            }
                        }
                        break;
                }
                
                if (!logMessage.isEmpty()) {
                    logger.atInfo().log(logMessage);
                }
                
                // Send updated group state to all clients
                if (affectedGroup != null) {
                    broadcastGroupState(ctx, affectedGroup);
                }
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error handling group management packet");
            }
        }
        
        private void handleGroupListQuery(ChannelHandlerContext ctx, byte[] data, InetSocketAddress sender) {
            try {
                if (groupManager == null) {
                    logger.atWarning().log("Group list query received but GroupManager not initialized");
                    return;
                }
                
                GroupListPacket packet = GroupListPacket.deserialize(data);
                
                // Build group list response
                List<GroupListPacket.GroupData> groupDataList = new ArrayList<>();
                for (Group group : groupManager.listGroups()) {
                    groupDataList.add(new GroupListPacket.GroupData(
                        group.getGroupId(),
                        group.getName(),
                        group.getMemberCount()
                    ));
                }
                
                // Send response back to client
                GroupListPacket response = new GroupListPacket(packet.getSenderId(), groupDataList);
                byte[] responseData = response.serialize();
                ByteBuf buf = ctx.alloc().buffer(responseData.length);
                buf.writeBytes(responseData);
                ctx.writeAndFlush(new DatagramPacket(buf, sender));
                
                logger.atFine().log("Sent group list to " + sender + " with " + groupDataList.size() + " groups");
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error handling group list query");
            }
        }
        
        private void broadcastGroupState(ChannelHandlerContext ctx, Group group) {
            try {
                GroupStatePacket packet = new GroupStatePacket(
                    SERVER_UUID,
                    group.getGroupId(),
                    group.getName(),
                    new ArrayList<>(group.getMembers()),
                    group.getCreatorUuid(),
                    group.isIsolated()
                );
                
                byte[] data = packet.serialize();
                
                // Send to all group members
                for (UUID memberId : group.getMembers()) {
                    UUID clientId = findClientByPlayerUUID(memberId);
                    if (clientId != null) {
                        InetSocketAddress clientAddr = clients.get(clientId);
                        if (clientAddr != null) {
                            // Create a new buffer for each recipient (more efficient than copy())
                            ByteBuf buf = ctx.alloc().buffer(data.length);
                            buf.writeBytes(data);
                            ctx.writeAndFlush(new DatagramPacket(buf, clientAddr));
                        }
                    }
                }
                
            } catch (Exception e) {
                logger.atSevere().withCause(e).log("Error broadcasting group state");
            }
        }
        
        private void sendOwnershipTransferNotification(UUID newOwnerUUID, String groupName) {
            // Note: Cannot send message directly to player from here
            // Log the transfer - player will see updated group state via GroupStatePacket
            logger.atInfo().log("Ownership transferred to " + newOwnerUUID + " for group " + groupName);
        }
        
        private void broadcastToAll(ChannelHandlerContext ctx, AudioPacket packet, InetSocketAddress sender) {
            byte[] data = packet.serialize();
            ByteBuf buf = ctx.alloc().buffer(data.length);
            buf.writeBytes(data);
            
            try {
                clients.forEach((uuid, address) -> {
                    if (!address.equals(sender)) {
                        ctx.writeAndFlush(new DatagramPacket(buf.copy(), address));
                    }
                });
            } finally {
                buf.release();
            }
        }
        
        /**
         * Generate a collision-resistant hash ID from a player UUID
         */
        private int generateHashId(UUID playerUUID) {
            int baseHash = playerUUID.hashCode();
            
            // Check for collisions and increment until we find a unique hash
            int hashId = baseHash;
            int attempts = 0;
            while (hashIdToPlayerUUID.containsKey(hashId) && attempts < 1000) {
                hashId = baseHash + attempts;
                attempts++;
            }
            
            if (attempts >= 1000) {
                logger.atWarning().log("Hash collision after 1000 attempts for player " + playerUUID);
                // Fallback: use current timestamp as hash
                hashId = (int) System.currentTimeMillis();
            }
            
            return hashId;
        }
        
        /**
         * Send PlayerNamePackets to a newly connected client for all existing players
         */
        private void sendAllPlayerNames(ChannelHandlerContext ctx, InetSocketAddress newClientAddress) {
            for (Map.Entry<Integer, String> entry : hashIdToUsername.entrySet()) {
                int hashId = entry.getKey();
                String username = entry.getValue();
                
                PlayerNamePacket packet = new PlayerNamePacket(SERVER_UUID, hashId, username);
                byte[] data = packet.serialize();
                ByteBuf buf = ctx.alloc().buffer(data.length);
                buf.writeBytes(data);
                ctx.writeAndFlush(new DatagramPacket(buf, newClientAddress));
            }
            
            logger.atFine().log("Sent " + hashIdToUsername.size() + " player names to " + newClientAddress);
        }
        
        /**
         * Broadcast a PlayerNamePacket to all clients except the sender
         */
        private void broadcastPlayerName(ChannelHandlerContext ctx, int hashId, String username, InetSocketAddress excludeAddress) {
            PlayerNamePacket packet = new PlayerNamePacket(SERVER_UUID, hashId, username);
            byte[] data = packet.serialize();
            
            for (InetSocketAddress address : clients.values()) {
                if (!address.equals(excludeAddress)) {
                    ByteBuf buf = ctx.alloc().buffer(data.length);
                    buf.writeBytes(data);
                    ctx.writeAndFlush(new DatagramPacket(buf, address));
                }
            }
            
            logger.atFine().log("Broadcast player name (hashId=" + hashId + ", username=" + username + ") to " + (clients.size() - 1) + " clients");
        }
        
        private void sendAuthAck(ChannelHandlerContext ctx, UUID clientId, InetSocketAddress address, 
                                 byte rejectionReason, String message, int selectedSampleRate) {
            try {
                AuthAckPacket ackPacket;
                if (rejectionReason == AuthAckPacket.REASON_ACCEPTED) {
                    ackPacket = AuthAckPacket.accepted(clientId, message, selectedSampleRate);
                } else {
                    ackPacket = AuthAckPacket.rejected(clientId, rejectionReason, message, selectedSampleRate);
                }
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
