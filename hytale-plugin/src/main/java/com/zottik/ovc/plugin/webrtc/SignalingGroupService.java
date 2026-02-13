package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonObject;
import com.zottik.ovc.common.signaling.SignalingMessage;
import com.zottik.ovc.plugin.GroupManager;
import io.netty.channel.ChannelHandlerContext;

import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Supplier;

final class SignalingGroupService {
    private final Supplier<GroupManager> groupManagerSupplier;
    private final Supplier<GroupStateManager> groupStateManagerSupplier;
    private final Map<UUID, WebRTCClient> clients;
    private final ClientIdMapper clientIdMapper;
    private final BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage;
    private final SignalingErrorResponder sendError;

    SignalingGroupService(
            Supplier<GroupManager> groupManagerSupplier,
            Supplier<GroupStateManager> groupStateManagerSupplier,
            Map<UUID, WebRTCClient> clients,
            ClientIdMapper clientIdMapper,
            BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage,
            SignalingErrorResponder sendError
    ) {
        this.groupManagerSupplier = groupManagerSupplier;
        this.groupStateManagerSupplier = groupStateManagerSupplier;
        this.clients = clients;
        this.clientIdMapper = clientIdMapper;
        this.sendMessage = sendMessage;
        this.sendError = sendError;
    }

    void handleListGroups(ChannelHandlerContext ctx) {
        GroupManager groupManager = groupManagerSupplier.get();
        if (groupManager == null) {
            sendError.send(ctx, "Group manager not available", null);
            return;
        }

        JsonObject responseData = SignalingPayloadFactory.buildGroupListData(
            groupManager.listGroups(),
            groupStateManagerSupplier.get(),
            clients,
            clientIdMapper,
            SignalingPayloadFactory.GroupListMode.REQUEST_RESPONSE
        );
        sendMessage.accept(ctx, new SignalingMessage("group_list", responseData));
    }

    void handleListPlayers(ChannelHandlerContext ctx) {
        JsonObject responseData = SignalingPayloadFactory.buildPlayerListData(
            clients.values(),
            groupStateManagerSupplier.get(),
            clientIdMapper
        );
        sendMessage.accept(ctx, new SignalingMessage("player_list", responseData));
    }

    void handleGetGroupMembers(ChannelHandlerContext ctx, SignalingMessage message) {
        GroupStateManager groupStateManager = groupStateManagerSupplier.get();
        if (groupStateManager == null) {
            sendError.send(ctx, "Group state manager not available", null);
            return;
        }

        JsonObject data = message.getData();
        String groupIdStr = data.has("groupId") ? data.get("groupId").getAsString() : null;
        if (groupIdStr == null) {
            sendError.send(ctx, "Invalid group ID", null);
            return;
        }

        UUID groupId;
        try {
            groupId = UUID.fromString(groupIdStr);
        } catch (IllegalArgumentException e) {
            sendError.send(ctx, "Invalid group ID format", null);
            return;
        }

        var membersArray = groupStateManager.getGroupMembersJson(groupId, clients, clientIdMapper);
        JsonObject responseData = new JsonObject();
        responseData.add("members", membersArray);
        sendMessage.accept(ctx, new SignalingMessage("group_members_list", responseData));
    }
}
