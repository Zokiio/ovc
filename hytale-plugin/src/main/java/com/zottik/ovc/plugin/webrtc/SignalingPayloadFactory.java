package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.zottik.ovc.common.model.Group;
import com.zottik.ovc.common.network.NetworkConfig;

import java.util.List;
import java.util.Map;
import java.util.UUID;

final class SignalingPayloadFactory {
    enum GroupListMode {
        BROADCAST,
        REQUEST_RESPONSE
    }

    private SignalingPayloadFactory() {
    }

    static JsonObject buildSessionResponseData(
            WebRTCClient client,
            boolean playerOnline,
            ClientIdMapper clientIdMapper,
            boolean isAdmin,
            List<String> stunServers,
            String transportMode,
            long heartbeatIntervalMs,
            long resumeWindowMs,
            boolean useProximityRadar,
            boolean useProximityRadarSpeakingOnly,
            boolean groupSpatialAudio
    ) {
        JsonObject responseData = new JsonObject();
        responseData.addProperty("clientId", obfuscateId(clientIdMapper, client.getClientId()));
        responseData.addProperty("username", client.getUsername());
        responseData.addProperty("pending", !playerOnline);
        responseData.addProperty("transportMode", transportMode);

        JsonArray stunServersArray = new JsonArray();
        if (stunServers != null) {
            for (String server : stunServers) {
                stunServersArray.add(server);
            }
        }
        responseData.add("stunServers", stunServersArray);
        responseData.addProperty("sessionId", client.getSessionId());
        responseData.addProperty("resumeToken", client.getResumeToken());
        responseData.addProperty("heartbeatIntervalMs", heartbeatIntervalMs);
        responseData.addProperty("resumeWindowMs", resumeWindowMs);
        responseData.addProperty("useProximityRadar", useProximityRadar);
        responseData.addProperty("useProximityRadarSpeakingOnly", useProximityRadarSpeakingOnly);
        responseData.addProperty("groupSpatialAudio", groupSpatialAudio);
        responseData.addProperty("audioCodec", client.getNegotiatedAudioCodec());
        responseData.add("audioCodecs", SignalingCodecNegotiator.buildSupportedAudioCodecs());
        responseData.add("audioCodecConfig", SignalingCodecNegotiator.buildAudioCodecConfig());
        responseData.addProperty("isAdmin", isAdmin);

        if (!playerOnline) {
            int timeoutSeconds = NetworkConfig.getPendingGameJoinTimeoutSeconds();
            String messageText = timeoutSeconds > 0
                    ? "Waiting for game session... disconnecting in " + timeoutSeconds + "s."
                    : "Waiting for game session...";
            responseData.addProperty("pendingMessage", messageText);
            responseData.addProperty("pendingTimeoutSeconds", timeoutSeconds);
        }

        return responseData;
    }

    static JsonObject buildHelloData(
            long heartbeatIntervalMs,
            long resumeWindowMs,
            boolean useProximityRadar,
            boolean useProximityRadarSpeakingOnly,
            boolean groupSpatialAudio,
            String defaultAudioCodec
    ) {
        JsonObject data = new JsonObject();
        data.addProperty("heartbeatIntervalMs", heartbeatIntervalMs);
        data.addProperty("resumeWindowMs", resumeWindowMs);
        data.addProperty("useProximityRadar", useProximityRadar);
        data.addProperty("useProximityRadarSpeakingOnly", useProximityRadarSpeakingOnly);
        data.addProperty("groupSpatialAudio", groupSpatialAudio);
        data.addProperty("audioCodec", defaultAudioCodec);
        data.add("audioCodecs", SignalingCodecNegotiator.buildSupportedAudioCodecs());
        data.add("audioCodecConfig", SignalingCodecNegotiator.buildAudioCodecConfig());
        return data;
    }

    static JsonObject buildGroupListData(
            Iterable<Group> groups,
            GroupStateManager groupStateManager,
            Map<UUID, WebRTCClient> allClients,
            ClientIdMapper clientIdMapper,
            GroupListMode mode
    ) {
        JsonArray groupsArray = new JsonArray();

        if (groups != null) {
            for (Group group : groups) {
                JsonObject groupObj = new JsonObject();
                groupObj.addProperty("id", group.getGroupId().toString());
                groupObj.addProperty("name", group.getName());
                groupObj.addProperty("memberCount", group.getMemberCount());
                groupObj.addProperty("maxMembers", group.getSettings().getMaxMembers());
                groupObj.addProperty("proximityRange", group.getSettings().getProximityRange());
                groupObj.addProperty("isIsolated", group.isIsolated());

                if (mode == GroupListMode.BROADCAST) {
                    groupObj.addProperty("isPermanent", group.isPermanent());
                    groupObj.addProperty("hasPassword", group.hasPassword());
                    UUID creatorUuid = group.getCreatorUuid();
                    if (creatorUuid != null) {
                        groupObj.addProperty("creatorClientId", obfuscateId(clientIdMapper, creatorUuid));
                    }
                }

                JsonArray membersArray = groupStateManager != null
                        ? groupStateManager.getGroupMembersJson(group.getGroupId(), allClients, clientIdMapper)
                        : new JsonArray();
                groupObj.add("members", membersArray);

                groupsArray.add(groupObj);
            }
        }

        JsonObject payload = new JsonObject();
        payload.add("groups", groupsArray);
        return payload;
    }

    static JsonObject buildPlayerListData(
            Iterable<WebRTCClient> clients,
            GroupStateManager groupStateManager,
            ClientIdMapper clientIdMapper
    ) {
        JsonArray playersArray = new JsonArray();

        if (clients != null) {
            for (WebRTCClient client : clients) {
                if (client == null || !client.isConnected() || client.isPendingGameSession()) {
                    continue;
                }

                JsonObject playerObj = new JsonObject();
                playerObj.addProperty("id", obfuscateId(clientIdMapper, client.getClientId()));
                playerObj.addProperty("username", client.getUsername());
                playerObj.addProperty("isSpeaking", client.isSpeaking());
                playerObj.addProperty("isMuted", client.isMuted());

                UUID groupId = groupStateManager != null ? groupStateManager.getClientGroup(client.getClientId()) : null;
                if (groupId != null) {
                    playerObj.addProperty("groupId", groupId.toString());
                }

                playersArray.add(playerObj);
            }
        }

        JsonObject payload = new JsonObject();
        payload.add("players", playersArray);
        return payload;
    }

    static JsonObject buildGroupMembersUpdateData(UUID groupId, String groupName, JsonArray membersArray) {
        JsonObject broadcastData = new JsonObject();
        broadcastData.addProperty("groupId", groupId.toString());
        broadcastData.addProperty("groupName", groupName);
        broadcastData.addProperty("memberCount", membersArray.size());
        broadcastData.add("members", membersArray);
        return broadcastData;
    }

    private static String obfuscateId(ClientIdMapper mapper, UUID id) {
        if (id == null) {
            return "";
        }
        if (mapper == null) {
            return id.toString();
        }
        return mapper.getObfuscatedId(id);
    }
}
