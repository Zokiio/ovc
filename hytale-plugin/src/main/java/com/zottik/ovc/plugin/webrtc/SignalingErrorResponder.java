package com.zottik.ovc.plugin.webrtc;

import io.netty.channel.ChannelHandlerContext;

@FunctionalInterface
interface SignalingErrorResponder {
    void send(ChannelHandlerContext ctx, String error, String code);
}
