package com.hytale.voicechat.plugin.config;

import com.hytale.voicechat.common.network.NetworkConfig;

import java.util.ArrayList;
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
        List<String> stunServers = new ArrayList<>(NetworkConfig.getStunServers());
        List<String> turnServers = new ArrayList<>(NetworkConfig.getTurnServers());

        if (stunServers.isEmpty()) {
            stunServers.add("stun:stun.cloudflare.com:3478");
            stunServers.add("stun:stun.cloudflare.com:53");
        }

        return new IceServerConfig(stunServers, turnServers);
    }
}
