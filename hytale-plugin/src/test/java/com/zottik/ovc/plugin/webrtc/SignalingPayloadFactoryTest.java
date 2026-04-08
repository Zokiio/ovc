package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.zottik.ovc.common.model.Group;
import com.zottik.ovc.common.model.GroupSettings;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SignalingPayloadFactoryTest {
    @Test
    void buildSessionResponseDataIncludesPendingAndCodecDetails() {
        UUID clientId = UUID.randomUUID();
        WebRTCClient client = new WebRTCClient(clientId, "alice", new EmbeddedChannel());
        client.setSessionId("session-1");
        client.setResumeToken("resume-1");
        client.setNegotiatedAudioCodec(WebRTCClient.AUDIO_CODEC_OPUS);

        ClientIdMapper mapper = new ClientIdMapper();
        JsonObject payload = SignalingPayloadFactory.buildSessionResponseData(
            client,
            false,
            mapper,
            true,
            List.of("stun:stun.cloudflare.com:3478"),
            "webrtc",
            15000L,
            30000L,
            true,
            false,
            true
        );

        assertEquals(mapper.getObfuscatedId(clientId), payload.get("clientId").getAsString());
        assertEquals("alice", payload.get("username").getAsString());
        assertTrue(payload.get("pending").getAsBoolean());
        assertEquals("webrtc", payload.get("transportMode").getAsString());
        assertEquals(WebRTCClient.AUDIO_CODEC_OPUS, payload.get("audioCodec").getAsString());
        assertTrue(payload.has("audioCodecs"));
        assertTrue(payload.has("audioCodecConfig"));
        assertTrue(payload.has("pendingMessage"));
        assertTrue(payload.has("pendingTimeoutSeconds"));
    }

    @Test
    void buildGroupListDataKeepsBroadcastAndResponseShape() {
        UUID creatorId = UUID.randomUUID();
        UUID groupId = UUID.randomUUID();

        WebRTCClient creatorClient = new WebRTCClient(creatorId, "creator", new EmbeddedChannel());

        Group group = new Group(groupId, "squad", true, creatorId, new GroupSettings());
        group.setPassword("secret");
        group.addMember(creatorId);

        ClientIdMapper mapper = new ClientIdMapper();

        JsonObject broadcastPayload = SignalingPayloadFactory.buildGroupListData(
            List.of(group),
            null,
            Map.of(creatorId, creatorClient),
            mapper,
            SignalingPayloadFactory.GroupListMode.BROADCAST
        );
        JsonObject responsePayload = SignalingPayloadFactory.buildGroupListData(
            List.of(group),
            null,
            Map.of(creatorId, creatorClient),
            mapper,
            SignalingPayloadFactory.GroupListMode.REQUEST_RESPONSE
        );

        JsonObject broadcastGroup = broadcastPayload.getAsJsonArray("groups").get(0).getAsJsonObject();
        JsonObject responseGroup = responsePayload.getAsJsonArray("groups").get(0).getAsJsonObject();

        assertEquals("squad", broadcastGroup.get("name").getAsString());
        assertEquals(0, broadcastGroup.getAsJsonArray("members").size());
        assertTrue(broadcastGroup.get("isPermanent").getAsBoolean());
        assertTrue(broadcastGroup.get("hasPassword").getAsBoolean());
        assertTrue(broadcastGroup.has("creatorClientId"));

        assertEquals("squad", responseGroup.get("name").getAsString());
        assertEquals(0, responseGroup.getAsJsonArray("members").size());
        assertFalse(responseGroup.has("isPermanent"));
        assertFalse(responseGroup.has("hasPassword"));
        assertFalse(responseGroup.has("creatorClientId"));
    }

    @Test
    void buildPlayerListDataExcludesPendingClients() {
        UUID activeId = UUID.randomUUID();
        UUID pendingId = UUID.randomUUID();

        WebRTCClient activeClient = new WebRTCClient(activeId, "active", new EmbeddedChannel());
        activeClient.setSpeaking(true);
        activeClient.setMuted(true);
        activeClient.setPendingGameSession(false);

        WebRTCClient pendingClient = new WebRTCClient(pendingId, "pending", new EmbeddedChannel());
        pendingClient.setPendingGameSession(true);

        JsonObject payload = SignalingPayloadFactory.buildPlayerListData(
            List.of(activeClient, pendingClient),
            null,
            new ClientIdMapper()
        );

        JsonArray players = payload.getAsJsonArray("players");
        assertEquals(1, players.size());
        JsonObject firstPlayer = players.get(0).getAsJsonObject();
        assertEquals("active", firstPlayer.get("username").getAsString());
        assertTrue(firstPlayer.get("isSpeaking").getAsBoolean());
        assertTrue(firstPlayer.get("isMuted").getAsBoolean());
        assertFalse(firstPlayer.has("groupId"));
    }
}
