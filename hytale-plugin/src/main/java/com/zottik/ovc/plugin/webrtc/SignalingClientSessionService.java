package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonObject;
import com.hypixel.hytale.server.core.permissions.PermissionsModule;
import com.zottik.ovc.common.model.Group;
import com.zottik.ovc.common.model.PlayerPosition;
import com.zottik.ovc.common.network.NetworkConfig;
import com.zottik.ovc.common.signaling.SignalingMessage;
import com.zottik.ovc.plugin.GroupManager;
import com.zottik.ovc.plugin.OVCPlugin;
import com.zottik.ovc.plugin.tracker.PlayerPositionTracker;
import io.netty.channel.ChannelHandlerContext;
import io.netty.util.AttributeKey;

import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;

final class SignalingClientSessionService {
    private final AttributeKey<WebRTCClient> clientAttr;
    private final Supplier<OVCPlugin> pluginSupplier;
    private final Supplier<PlayerPositionTracker> positionTrackerSupplier;
    private final Supplier<GroupManager> groupManagerSupplier;
    private final Supplier<GroupStateManager> groupStateManagerSupplier;
    private final Supplier<WebRTCSignalingServer.WebRTCClientListener> clientListenerSupplier;
    private final Map<UUID, WebRTCClient> clients;
    private final Map<String, WebRTCSignalingServer.ResumableSession> resumableSessions;
    private final ClientIdMapper clientIdMapper;
    private final BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage;
    private final SignalingErrorResponder sendError;
    private final BiConsumer<WebRTCClient, Boolean> cleanupClient;
    private final Consumer<UUID> schedulePendingAuthDisconnect;
    private final Consumer<UUID> cancelPendingAuthDisconnect;
    private final Runnable broadcastPlayerList;
    private final Consumer<UUID> broadcastGroupMembersUpdate;
    private final Supplier<String> sessionIdGenerator;
    private final Supplier<String> resumeTokenGenerator;
    private final long heartbeatIntervalMs;
    private final long resumeWindowMs;

    SignalingClientSessionService(
            AttributeKey<WebRTCClient> clientAttr,
            Supplier<OVCPlugin> pluginSupplier,
            Supplier<PlayerPositionTracker> positionTrackerSupplier,
            Supplier<GroupManager> groupManagerSupplier,
            Supplier<GroupStateManager> groupStateManagerSupplier,
            Supplier<WebRTCSignalingServer.WebRTCClientListener> clientListenerSupplier,
            Map<UUID, WebRTCClient> clients,
            Map<String, WebRTCSignalingServer.ResumableSession> resumableSessions,
            ClientIdMapper clientIdMapper,
            BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage,
            SignalingErrorResponder sendError,
            BiConsumer<WebRTCClient, Boolean> cleanupClient,
            Consumer<UUID> schedulePendingAuthDisconnect,
            Consumer<UUID> cancelPendingAuthDisconnect,
            Runnable broadcastPlayerList,
            Consumer<UUID> broadcastGroupMembersUpdate,
            Supplier<String> sessionIdGenerator,
            Supplier<String> resumeTokenGenerator,
            long heartbeatIntervalMs,
            long resumeWindowMs
    ) {
        this.clientAttr = clientAttr;
        this.pluginSupplier = pluginSupplier;
        this.positionTrackerSupplier = positionTrackerSupplier;
        this.groupManagerSupplier = groupManagerSupplier;
        this.groupStateManagerSupplier = groupStateManagerSupplier;
        this.clientListenerSupplier = clientListenerSupplier;
        this.clients = clients;
        this.resumableSessions = resumableSessions;
        this.clientIdMapper = clientIdMapper;
        this.sendMessage = sendMessage;
        this.sendError = sendError;
        this.cleanupClient = cleanupClient;
        this.schedulePendingAuthDisconnect = schedulePendingAuthDisconnect;
        this.cancelPendingAuthDisconnect = cancelPendingAuthDisconnect;
        this.broadcastPlayerList = broadcastPlayerList;
        this.broadcastGroupMembersUpdate = broadcastGroupMembersUpdate;
        this.sessionIdGenerator = sessionIdGenerator;
        this.resumeTokenGenerator = resumeTokenGenerator;
        this.heartbeatIntervalMs = heartbeatIntervalMs;
        this.resumeWindowMs = resumeWindowMs;
    }

    boolean shouldBlockPendingMessage(ChannelHandlerContext ctx, String messageType) {
        if (SignalingMessage.TYPE_AUTHENTICATE.equals(messageType)) {
            return false;
        }
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null || !client.isPendingGameSession()) {
            return false;
        }
        if (SignalingMessage.TYPE_DISCONNECT.equals(messageType)
                || "ping".equals(messageType)
                || SignalingMessage.TYPE_HEARTBEAT.equals(messageType)) {
            return false;
        }
        sendPendingStatus(ctx);
        return true;
    }

    void sendHello(ChannelHandlerContext ctx) {
        String defaultAudioCodec = NetworkConfig.isOpusDataChannelEnabled()
                ? WebRTCClient.AUDIO_CODEC_OPUS
                : WebRTCClient.AUDIO_CODEC_PCM;
        JsonObject data = SignalingPayloadFactory.buildHelloData(
            heartbeatIntervalMs,
            resumeWindowMs,
            NetworkConfig.isProximityRadarEnabled(),
            NetworkConfig.isProximityRadarSpeakingOnlyEnabled(),
            NetworkConfig.isGroupSpatialAudio(),
            defaultAudioCodec
        );
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_HELLO, data));
    }

    void handleAuthenticate(ChannelHandlerContext ctx, SignalingMessage message) {
        JsonObject data = message.getData();
        if (!data.has("username")) {
            sendError.send(ctx, "Missing username", null);
            return;
        }
        String username = data.get("username").getAsString();

        OVCPlugin plugin = pluginSupplier.get();
        if (plugin != null) {
            if (!data.has("authCode")) {
                sendError.send(ctx, "Missing auth code. Use /vc login in-game to get your code.", null);
                return;
            }
            String authCode = data.get("authCode").getAsString();
            if (!plugin.getAuthCodeStore().validateCode(username, authCode)) {
                sendError.send(ctx, "Invalid auth code. Use /vc login in-game to get the correct code.", null);
                return;
            }
        }

        UUID clientId = null;
        if (plugin != null) {
            clientId = plugin.getAuthCodeStore().getPlayerUUID(username);
        }
        PlayerPositionTracker positionTracker = positionTrackerSupplier.get();
        if (clientId == null && positionTracker != null) {
            clientId = positionTracker.getPlayerUUIDByUsername(username);
        }
        if (clientId == null) {
            sendError.send(ctx, "Player not found. Please log in to the game first.", null);
            return;
        }

        String negotiatedCodec = SignalingCodecNegotiator.negotiateAudioCodec(data);
        if (negotiatedCodec == null) {
            sendError.send(ctx, "Client does not support required audio codec: opus", "codec_unsupported");
            return;
        }

        WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
        client.setSessionId(sessionIdGenerator.get());
        client.setResumeToken(resumeTokenGenerator.get());
        client.setLastHeartbeatAt(System.currentTimeMillis());
        client.setNegotiatedAudioCodec(negotiatedCodec);

        boolean playerOnline = plugin == null || plugin.isPlayerOnline(clientId);
        client.setPendingGameSession(!playerOnline);
        clients.put(clientId, client);
        ctx.channel().attr(clientAttr).set(client);

        if (playerOnline && positionTracker != null) {
            PlayerPosition position = new PlayerPosition(clientId, username, 0, 0, 0, 0, 0, "overworld");
            positionTracker.addPlayer(position);
        } else if (!playerOnline) {
            schedulePendingAuthDisconnect.accept(clientId);
        }

        WebRTCSignalingServer.WebRTCClientListener clientListener = clientListenerSupplier.get();
        if (clientListener != null) {
            clientListener.onClientConnected(clientId, username);
        }

        if (playerOnline) {
            syncClientGroupState(ctx, client, null);
        }

        JsonObject responseData = SignalingPayloadFactory.buildSessionResponseData(
            client,
            playerOnline,
            clientIdMapper,
            PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin"),
            NetworkConfig.getStunServers(),
            NetworkConfig.getWebRtcTransportMode(),
            heartbeatIntervalMs,
            resumeWindowMs,
            NetworkConfig.isProximityRadarEnabled(),
            NetworkConfig.isProximityRadarSpeakingOnlyEnabled(),
            NetworkConfig.isGroupSpatialAudio()
        );
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_AUTH_SUCCESS, responseData));
        sendHello(ctx);

        if (playerOnline) {
            broadcastPlayerList.run();
        }
    }

    void handleResume(ChannelHandlerContext ctx, SignalingMessage message) {
        if (ctx.channel().attr(clientAttr).get() != null) {
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

        WebRTCSignalingServer.ResumableSession session = resumableSessions.get(resumeToken);
        if (session == null || !session.getSessionId().equals(sessionId)) {
            sendResumeFailed(ctx, "Resume session not found");
            return;
        }
        if (session.getExpiresAt() < System.currentTimeMillis()) {
            resumableSessions.remove(resumeToken);
            clientIdMapper.removeMapping(session.getClientId());
            sendResumeFailed(ctx, "Resume window expired");
            return;
        }
        resumableSessions.remove(resumeToken);
        if (clients.containsKey(session.getClientId())) {
            sendResumeFailed(ctx, "Session already active");
            return;
        }

        String negotiatedCodec = (session.getNegotiatedAudioCodec() == null || session.getNegotiatedAudioCodec().isEmpty())
                ? (NetworkConfig.isOpusDataChannelEnabled() ? WebRTCClient.AUDIO_CODEC_OPUS : WebRTCClient.AUDIO_CODEC_PCM)
                : session.getNegotiatedAudioCodec();
        if (!SignalingCodecNegotiator.clientSupportsCodec(data, negotiatedCodec)) {
            sendError.send(ctx, "Client does not support required audio codec: " + negotiatedCodec, "codec_unsupported");
            return;
        }

        UUID clientId = session.getClientId();
        String username = session.getUsername();
        WebRTCClient client = new WebRTCClient(clientId, username, ctx.channel());
        client.setSessionId(session.getSessionId());
        client.setResumeToken(resumeTokenGenerator.get());
        client.setLastHeartbeatAt(System.currentTimeMillis());
        client.setNegotiatedAudioCodec(negotiatedCodec);

        OVCPlugin plugin = pluginSupplier.get();
        boolean playerOnline = plugin == null || plugin.isPlayerOnline(clientId);
        client.setPendingGameSession(!playerOnline);
        clients.put(clientId, client);
        ctx.channel().attr(clientAttr).set(client);

        PlayerPositionTracker positionTracker = positionTrackerSupplier.get();
        if (playerOnline && positionTracker != null) {
            PlayerPosition position = new PlayerPosition(clientId, username, 0, 0, 0, 0, 0, "overworld");
            positionTracker.addPlayer(position);
        } else if (!playerOnline) {
            schedulePendingAuthDisconnect.accept(clientId);
        }

        WebRTCSignalingServer.WebRTCClientListener clientListener = clientListenerSupplier.get();
        if (clientListener != null) {
            clientListener.onClientConnected(clientId, username);
        }

        if (playerOnline) {
            syncClientGroupState(ctx, client, session.getLastGroupId());
        }

        JsonObject responseData = SignalingPayloadFactory.buildSessionResponseData(
            client,
            playerOnline,
            clientIdMapper,
            PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin"),
            NetworkConfig.getStunServers(),
            NetworkConfig.getWebRtcTransportMode(),
            heartbeatIntervalMs,
            resumeWindowMs,
            NetworkConfig.isProximityRadarEnabled(),
            NetworkConfig.isProximityRadarSpeakingOnlyEnabled(),
            NetworkConfig.isGroupSpatialAudio()
        );
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_RESUMED, responseData));
        sendHello(ctx);

        if (playerOnline) {
            broadcastPlayerList.run();
        }
    }

    void handleHeartbeat(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null) {
            return;
        }

        client.setLastHeartbeatAt(System.currentTimeMillis());

        JsonObject data = message.getData();
        long timestamp = data.has("timestamp") ? data.get("timestamp").getAsLong() : System.currentTimeMillis();
        JsonObject responseData = new JsonObject();
        responseData.addProperty("timestamp", timestamp);
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_HEARTBEAT_ACK, responseData));
    }

    void handleDisconnect(ChannelHandlerContext ctx) {
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null) {
            return;
        }
        cleanupClient.accept(client, shouldRemoveFromPositionTracker(client.getClientId()));
    }

    void activatePendingClient(UUID clientId) {
        WebRTCClient client = clients.get(clientId);
        if (client == null || !client.isPendingGameSession()) {
            return;
        }

        client.setPendingGameSession(false);
        cancelPendingAuthDisconnect.accept(clientId);

        JsonObject data = new JsonObject();
        data.addProperty("message", "Game session ready");
        SignalingMessage message = new SignalingMessage("game_session_ready", data);
        client.sendMessage(message.toJson());

        broadcastPlayerList.run();
    }

    private void sendPendingStatus(ChannelHandlerContext ctx) {
        JsonObject data = new JsonObject();
        int timeoutSeconds = NetworkConfig.getPendingGameJoinTimeoutSeconds();
        String messageText = timeoutSeconds > 0
                ? "Waiting for game session... disconnecting in " + timeoutSeconds + "s."
                : "Waiting for game session...";
        data.addProperty("message", messageText);
        data.addProperty("timeoutSeconds", timeoutSeconds);
        sendMessage.accept(ctx, new SignalingMessage("pending_game_session", data));
    }

    private void sendResumeFailed(ChannelHandlerContext ctx, String reason) {
        JsonObject errorData = new JsonObject();
        errorData.addProperty("message", reason);
        errorData.addProperty("code", "resume_failed");
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_ERROR, errorData));
    }

    private void syncClientGroupState(ChannelHandlerContext ctx, WebRTCClient client, UUID fallbackGroupId) {
        GroupManager groupManager = groupManagerSupplier.get();
        GroupStateManager groupStateManager = groupStateManagerSupplier.get();
        if (client == null || groupManager == null || groupStateManager == null) {
            return;
        }

        Group group = groupManager.getPlayerGroup(client.getClientId());
        if (group == null && fallbackGroupId != null) {
            group = groupManager.getGroup(fallbackGroupId);
        }
        if (group == null) {
            return;
        }

        UUID groupId = group.getGroupId();
        groupStateManager.addClientToGroup(client.getClientId(), client, groupId);

        JsonObject responseData = new JsonObject();
        responseData.addProperty("groupId", groupId.toString());
        responseData.addProperty("groupName", group.getName());
        sendMessage.accept(ctx, new SignalingMessage("group_joined", responseData));

        broadcastGroupMembersUpdate.accept(groupId);
    }

    private boolean shouldRemoveFromPositionTracker(UUID clientId) {
        OVCPlugin plugin = pluginSupplier.get();
        if (plugin == null) {
            return true;
        }
        return !plugin.isPlayerOnline(clientId);
    }
}
