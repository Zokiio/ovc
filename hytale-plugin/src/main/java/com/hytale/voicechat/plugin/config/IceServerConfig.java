package com.hytale.voicechat.plugin.config;

import java.util.List;

/**
 * Simple ICE server configuration holder.
 *
 * TODO: Load from external config (e.g., webrtc-config.yml).
 */
public class IceServerConfig {
    private final List<String> stunServers;
    private final List<String> turnServers;

    public IceServerConfig(List<String> stunServers, List<String> turnServers) {
        this.stunServers = stunServers;
        this.turnServers = turnServers;
    }

    public List<String> getStunServers() {
        return stunServers;
    }

    public List<String> getTurnServers() {
        return turnServers;
    }

    public static IceServerConfig defaults() {
        return new IceServerConfig(
            List.of(
                "stun:stun.cloudflare.com:3478",
                "stun:stun.cloudflare.com:53"
            ),
            List.of()
        );
    }
}
