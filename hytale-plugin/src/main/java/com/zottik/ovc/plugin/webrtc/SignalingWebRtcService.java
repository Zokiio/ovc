package com.zottik.ovc.plugin.webrtc;

import com.google.gson.JsonObject;
import com.zottik.ovc.common.signaling.SignalingMessage;
import io.netty.channel.ChannelHandlerContext;
import io.netty.util.AttributeKey;

import java.util.UUID;
import java.util.function.BiConsumer;
import java.util.function.Supplier;

final class SignalingWebRtcService {
    private final AttributeKey<WebRTCClient> clientAttr;
    private final Supplier<WebRTCPeerManager> peerManagerSupplier;
    private final BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage;
    private final SignalingErrorResponder sendError;

    SignalingWebRtcService(
            AttributeKey<WebRTCClient> clientAttr,
            Supplier<WebRTCPeerManager> peerManagerSupplier,
            BiConsumer<ChannelHandlerContext, SignalingMessage> sendMessage,
            SignalingErrorResponder sendError
    ) {
        this.clientAttr = clientAttr;
        this.peerManagerSupplier = peerManagerSupplier;
        this.sendMessage = sendMessage;
        this.sendError = sendError;
    }

    void handleOffer(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null) {
            sendError.send(ctx, "Not authenticated", null);
            return;
        }

        WebRTCPeerManager peerManager = peerManagerSupplier.get();
        if (peerManager == null) {
            sendError.send(ctx, "WebRTC peer manager not available", null);
            return;
        }

        JsonObject data = message.getData();
        if (!data.has("sdp")) {
            sendError.send(ctx, "Missing SDP offer", null);
            return;
        }

        String offerSdp = data.get("sdp").getAsString();
        String answerSdp = peerManager.createPeerConnection(client.getClientId(), offerSdp);

        JsonObject responseData = new JsonObject();
        responseData.addProperty("sdp", answerSdp);
        sendMessage.accept(ctx, new SignalingMessage(SignalingMessage.TYPE_ANSWER, responseData));
    }

    void handleIceCandidate(ChannelHandlerContext ctx, SignalingMessage message) {
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null) {
            sendError.send(ctx, "Not authenticated", null);
            return;
        }

        WebRTCPeerManager peerManager = peerManagerSupplier.get();
        if (peerManager == null) {
            sendError.send(ctx, "WebRTC peer manager not available", null);
            return;
        }

        JsonObject data = message.getData();
        if (data.has("complete") && data.get("complete").getAsBoolean()) {
            peerManager.handleIceCandidateComplete(client.getClientId());
            return;
        }
        if (!data.has("candidate")) {
            sendError.send(ctx, "Missing ICE candidate", null);
            return;
        }

        String candidate = data.get("candidate").getAsString();
        if (candidate == null || candidate.isEmpty()) {
            return;
        }
        String sdpMid = data.has("sdpMid") ? data.get("sdpMid").getAsString() : null;
        int sdpMLineIndex = data.has("sdpMLineIndex") ? data.get("sdpMLineIndex").getAsInt() : -1;

        peerManager.handleIceCandidate(client.getClientId(), candidate, sdpMid, sdpMLineIndex);
    }

    void handleStartDataChannel(ChannelHandlerContext ctx) {
        WebRTCClient client = ctx.channel().attr(clientAttr).get();
        if (client == null) {
            sendError.send(ctx, "Not authenticated", null);
            return;
        }

        WebRTCPeerManager peerManager = peerManagerSupplier.get();
        if (peerManager == null) {
            sendError.send(ctx, "WebRTC peer manager not available", null);
            return;
        }

        UUID clientId = client.getClientId();
        peerManager.startDataChannelTransport(clientId);
    }
}
