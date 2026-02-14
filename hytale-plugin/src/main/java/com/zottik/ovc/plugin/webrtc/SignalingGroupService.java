package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.hypixel.hytale.logger.HytaleLogger;
import com.hypixel.hytale.server.core.permissions.PermissionsModule;
import com.zottik.ovc.common.model.GroupSettings;
import com.zottik.ovc.common.network.NetworkConfig;
import com.zottik.ovc.common.signaling.SignalingMessage;
import com.zottik.ovc.plugin.GroupManager;
import io.netty.channel.ChannelHandlerContext;
import io.netty.util.AttributeKey;

import java.util.Map;
import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Supplier;

final class SignalingGroupService {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    private final AttributeKey<WebRTCClient> clientAttr;
    private final Supplier<GroupManager> groupManagerSupplier;
    private final Supplier<GroupStateManager> groupStateManagerSupplier;
    private final Map<UUID, WebRTCClient> clients;
    private final ClientIdMapper clientIdMapper;
    private final BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage;
    private final SignalingErrorResponder sendError;
    private final Runnable broadcastGroupList;
    private final Consumer<UUID> broadcastGroupMembersUpdate;

    SignalingGroupService(
            AttributeKey<WebRTCClient> clientAttr,
            Supplier<GroupManager> groupManagerSupplier,
            Supplier<GroupStateManager> groupStateManagerSupplier,
            Map<UUID, WebRTCClient> clients,
            ClientIdMapper clientIdMapper,
            BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage,
            SignalingErrorResponder sendError,
            Runnable broadcastGroupList,
            Consumer<UUID> broadcastGroupMembersUpdate
    ) {
        this.clientAttr = clientAttr;
        this.groupManagerSupplier = groupManagerSupplier;
        this.groupStateManagerSupplier = groupStateManagerSupplier;
        this.clients = clients;
        this.clientIdMapper = clientIdMapper;
        this.sendMessage = sendMessage;
        this.sendError = sendError;
        this.broadcastGroupList = broadcastGroupList;
        this.broadcastGroupMembersUpdate = broadcastGroupMembersUpdate;
    }

    void handleCreateGroup(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = requireAuthenticatedClient(ctx);
        if (client == null) {
            return;
        }
        GroupManager groupManager = requireGroupManager(ctx);
        if (groupManager == null) {
            return;
        }
        GroupStateManager groupStateManager = requireGroupStateManager(ctx);
        if (groupStateManager == null) {
            return;
        }

        JsonObject data = message.getData();
        String groupName = data.has("groupName") ? data.get("groupName").getAsString() : null;
        if (groupName == null || groupName.isEmpty()) {
            sendError.send(ctx, "Invalid group name", null);
            return;
        }

        GroupSettings settings = new GroupSettings();
        boolean isIsolated = NetworkConfig.DEFAULT_GROUP_IS_ISOLATED;
        if (data.has("settings")) {
            JsonObject settingsObj = data.getAsJsonObject("settings");
            int defaultVolume = settingsObj.has("defaultVolume") ? settingsObj.get("defaultVolume").getAsInt() : GroupSettings.DEFAULT_VOLUME;
            double proximityRange = settingsObj.has("proximityRange") ? settingsObj.get("proximityRange").getAsDouble() : GroupSettings.DEFAULT_PROXIMITY_RANGE;
            boolean allowInvites = settingsObj.has("allowInvites") ? settingsObj.get("allowInvites").getAsBoolean() : GroupSettings.DEFAULT_ALLOW_INVITES;
            int maxMembers = settingsObj.has("maxMembers") ? settingsObj.get("maxMembers").getAsInt() : GroupSettings.DEFAULT_MAX_MEMBERS;
            isIsolated = settingsObj.has("isIsolated")
                    ? settingsObj.get("isIsolated").getAsBoolean()
                    : NetworkConfig.DEFAULT_GROUP_IS_ISOLATED;
            settings = new GroupSettings(defaultVolume, proximityRange, allowInvites, maxMembers);
        }

        String password = null;
        if (data.has("password")) {
            JsonElement passwordElement = data.get("password");
            if (!passwordElement.isJsonNull()) {
                try {
                    password = passwordElement.getAsString();
                } catch (ClassCastException | IllegalStateException e) {
                    logger.atWarning().log("Client " + client.getUsername() + " sent invalid password type: " + e.getMessage());
                    sendError.send(ctx, "Invalid password value", null);
                    return;
                }
            }
        }

        boolean isPermanent = false;
        if (data.has("isPermanent")) {
            JsonElement isPermanentElement = data.get("isPermanent");
            if (!isPermanentElement.isJsonNull()) {
                try {
                    if (isPermanentElement.getAsBoolean()) {
                        if (PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin")) {
                            isPermanent = true;
                        } else {
                            logger.atWarning().log("Non-admin " + client.getUsername() + " attempted to create permanent group");
                        }
                    }
                } catch (ClassCastException | IllegalStateException e) {
                    logger.atWarning().log("Client " + client.getUsername() + " sent invalid isPermanent type: " + e.getMessage());
                    sendError.send(ctx, "Invalid isPermanent value", null);
                    return;
                }
            }
        }

        var group = groupManager.createGroup(groupName, isPermanent, client.getClientId(), settings, isIsolated);
        if (group == null) {
            sendError.send(ctx, "Failed to create group (name may already exist)", null);
            return;
        }

        if (password != null && !password.isEmpty()) {
            group.setPassword(password);
        }

        groupManager.joinGroup(client.getClientId(), group.getGroupId());
        groupStateManager.addClientToGroup(client.getClientId(), client, group.getGroupId());

        JsonObject responseData = new JsonObject();
        responseData.addProperty("groupId", group.getGroupId().toString());
        responseData.addProperty("groupName", group.getName());
        responseData.addProperty("memberCount", group.getMemberCount());
        responseData.addProperty("membersCount", group.getMemberCount());
        responseData.addProperty("isIsolated", group.isIsolated());
        responseData.addProperty("isPermanent", group.isPermanent());
        responseData.addProperty("hasPassword", group.hasPassword());
        responseData.addProperty("creatorClientId", clientIdMapper.getObfuscatedId(client.getClientId()));
        sendMessage.accept(ctx, new SignalingMessage("group_created", responseData));
    }

    void handleJoinGroup(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = requireAuthenticatedClient(ctx);
        if (client == null) {
            return;
        }
        GroupManager groupManager = requireGroupManager(ctx);
        if (groupManager == null) {
            return;
        }
        GroupStateManager groupStateManager = requireGroupStateManager(ctx);
        if (groupStateManager == null) {
            return;
        }

        JsonObject data = message.getData();
        UUID groupId = parseGroupId(
                ctx,
                data,
                "Invalid group ID",
                "Invalid group ID format"
        );
        if (groupId == null) {
            return;
        }

        var group = groupManager.getGroup(groupId);
        if (group == null) {
            sendError.send(ctx, "Group not found", "group_not_found");
            return;
        }

        if (group.hasPassword()) {
            String password = null;
            if (data.has("password")) {
                JsonElement passwordElement = data.get("password");
                if (!passwordElement.isJsonNull()) {
                    try {
                        password = passwordElement.getAsString();
                    } catch (ClassCastException | IllegalStateException e) {
                        logger.atWarning().log("Client " + client.getUsername() + " sent invalid password type for group join: " + e.getMessage());
                        sendError.send(ctx, "Incorrect password", "incorrect_password");
                        return;
                    }
                }
            }
            if (!group.checkPassword(password)) {
                sendError.send(ctx, "Incorrect password", "incorrect_password");
                return;
            }
        }

        if (group.getSettings().isAtCapacity(group.getMemberCount())) {
            sendError.send(ctx, "Group is at capacity", "group_full");
            return;
        }

        boolean joined = groupManager.joinGroup(client.getClientId(), groupId);
        if (!joined) {
            sendError.send(ctx, "Failed to join group", null);
            return;
        }

        groupStateManager.addClientToGroup(client.getClientId(), client, groupId);

        JsonObject responseData = new JsonObject();
        responseData.addProperty("groupId", groupId.toString());
        responseData.addProperty("groupName", group.getName());
        sendMessage.accept(ctx, new SignalingMessage("group_joined", responseData));

        broadcastGroupMembersUpdate.accept(groupId);
    }

    void handleLeaveGroup(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = requireAuthenticatedClient(ctx);
        if (client == null) {
            return;
        }
        GroupManager groupManager = requireGroupManager(ctx);
        if (groupManager == null) {
            return;
        }
        GroupStateManager groupStateManager = requireGroupStateManager(ctx);
        if (groupStateManager == null) {
            return;
        }

        UUID groupId = groupStateManager.getClientGroup(client.getClientId());
        if (groupId == null) {
            sendError.send(ctx, "Not in any group", null);
            return;
        }

        groupManager.leaveGroup(client.getClientId());
        groupStateManager.removeClientFromAllGroups(client.getClientId());

        int memberCount = groupManager.getGroupMembers(groupId).size();
        JsonObject responseData = new JsonObject();
        responseData.addProperty("groupId", groupId.toString());
        responseData.addProperty("memberCount", memberCount);
        sendMessage.accept(ctx, new SignalingMessage("group_left", responseData));

        broadcastGroupMembersUpdate.accept(groupId);
    }

    void handleUpdateGroupPassword(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = requireAuthenticatedClient(ctx);
        if (client == null) {
            return;
        }
        GroupManager groupManager = requireGroupManager(ctx);
        if (groupManager == null) {
            return;
        }

        JsonObject data = message.getData();
        UUID groupId = parseGroupId(
                ctx,
                data,
                "Invalid group ID",
                "Invalid group ID format"
        );
        if (groupId == null) {
            return;
        }

        var group = groupManager.getGroup(groupId);
        if (group == null) {
            sendError.send(ctx, "Group not found", null);
            return;
        }

        if (!group.isCreator(client.getClientId())) {
            sendError.send(ctx, "Only the group creator can change the password", null);
            return;
        }

        String password = data.has("password") && !data.get("password").isJsonNull()
                ? data.get("password").getAsString()
                : null;
        group.setPassword(password);

        JsonObject responseData = new JsonObject();
        responseData.addProperty("groupId", groupId.toString());
        responseData.addProperty("hasPassword", group.hasPassword());
        sendMessage.accept(ctx, new SignalingMessage("group_password_updated", responseData));

        broadcastGroupList.run();
    }

    void handleSetGroupPermanent(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = requireAuthenticatedClient(ctx);
        if (client == null) {
            return;
        }
        GroupManager groupManager = requireGroupManager(ctx);
        if (groupManager == null) {
            return;
        }

        if (!PermissionsModule.get().hasPermission(client.getClientId(), "ovc.admin")) {
            sendError.send(ctx, "Only server admins can mark groups as permanent", null);
            return;
        }

        JsonObject data = message.getData();
        UUID groupId = parseGroupId(
                ctx,
                data,
                "Invalid group ID",
                "Invalid group ID format"
        );
        if (groupId == null) {
            return;
        }

        Boolean isPermanent = parseBoolean(
                ctx,
                data,
                "isPermanent",
                false,
                "Invalid isPermanent value",
                value -> logger.atWarning().log("Client " + client.getUsername()
                        + " sent invalid isPermanent type for setPermanent: " + value)
        );
        if (isPermanent == null) {
            return;
        }

        var group = groupManager.getGroup(groupId);
        if (group == null) {
            sendError.send(ctx, "Group not found", null);
            return;
        }

        group.setPermanent(isPermanent);

        JsonObject responseData = new JsonObject();
        responseData.addProperty("groupId", groupId.toString());
        responseData.addProperty("isPermanent", group.isPermanent());
        sendMessage.accept(ctx, new SignalingMessage("group_permanent_updated", responseData));

        broadcastGroupList.run();
    }

    void handleListGroups(ChannelHandlerContext ctx) {
        GroupManager groupManager = requireGroupManager(ctx);
        if (groupManager == null) {
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
        GroupStateManager groupStateManager = requireGroupStateManager(ctx);
        if (groupStateManager == null) {
            return;
        }

        JsonObject data = message.getData();
        UUID groupId = parseGroupId(
                ctx,
                data,
                "Invalid group ID",
                "Invalid group ID format"
        );
        if (groupId == null) {
            return;
        }

        var membersArray = groupStateManager.getGroupMembersJson(groupId, clients, clientIdMapper);
        JsonObject responseData = new JsonObject();
        responseData.add("members", membersArray);
        sendMessage.accept(ctx, new SignalingMessage("group_members_list", responseData));
    }

    private WebRTCClient requireAuthenticatedClient(ChannelHandlerContext ctx) {
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null) {
            sendError.send(ctx, "Not authenticated", null);
        }
        return client;
    }

    private GroupManager requireGroupManager(ChannelHandlerContext ctx) {
        GroupManager groupManager = groupManagerSupplier.get();
        if (groupManager == null) {
            sendError.send(ctx, "Group manager not available", null);
        }
        return groupManager;
    }

    private GroupStateManager requireGroupStateManager(ChannelHandlerContext ctx) {
        GroupStateManager groupStateManager = groupStateManagerSupplier.get();
        if (groupStateManager == null) {
            sendError.send(ctx, "Group state manager not available", null);
        }
        return groupStateManager;
    }

    private UUID parseGroupId(
            ChannelHandlerContext ctx,
            JsonObject data,
            String missingGroupIdMessage,
            String invalidGroupIdMessage
    ) {
        String groupIdStr = data.has("groupId") ? data.get("groupId").getAsString() : null;
        if (groupIdStr == null) {
            sendError.send(ctx, missingGroupIdMessage, null);
            return null;
        }
        try {
            return UUID.fromString(groupIdStr);
        } catch (IllegalArgumentException e) {
            sendError.send(ctx, invalidGroupIdMessage, null);
            return null;
        }
    }

    private Boolean parseBoolean(
            ChannelHandlerContext ctx,
            JsonObject data,
            String key,
            boolean defaultValue,
            String errorMessage,
            Consumer<String> invalidLog
    ) {
        if (!data.has(key)) {
            return defaultValue;
        }
        JsonElement element = data.get(key);
        if (element == null || element.isJsonNull()) {
            return defaultValue;
        }
        try {
            return element.getAsBoolean();
        } catch (ClassCastException | IllegalStateException e) {
            invalidLog.accept(e.getMessage());
            sendError.send(ctx, errorMessage, null);
            return null;
        }
    }
}
