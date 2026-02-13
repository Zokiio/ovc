package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonObject;
import com.zottik.ovc.common.signaling.SignalingMessage;
import io.netty.channel.ChannelHandlerContext;
import io.netty.util.AttributeKey;

import java.util.function.BiConsumer;

final class SignalingClientSessionService {
    private final AttributeKey<WebRTCClient> clientAttr;
    private final BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage;

    SignalingClientSessionService(
            AttributeKey<WebRTCClient> clientAttr,
            BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage
    ) {
        this.clientAttr = clientAttr;
        this.sendMessage = sendMessage;
    }

    void sendHello(
            ChannelHandlerContext ctx,
            long heartbeatIntervalMs,
            long resumeWindowMs,
            boolean useProximityRadar,
            boolean useProximityRadarSpeakingOnly,
            boolean groupSpatialAudio,
            String defaultAudioCodec
    ) {
        JsonObject data = SignalingPayloadFactory.buildHelloData(
            heartbeatIntervalMs,
            resumeWindowMs,
            useProximityRadar,
            useProximityRadarSpeakingOnly,
            groupSpatialAudio,
            defaultAudioCodec
        );
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_HELLO, data));
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
}
