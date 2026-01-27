package com.hytale.voicechat.plugin.webrtc;

import io.netty.channel.Channel;

import java.util.UUID;

/**
 * Represents a connected WebRTC client
 */
public class WebRTCClient {
    private final UUID clientId;
    private final String username;
    private final Channel channel;
    private volatile boolean authenticated;
    
    public WebRTCClient(UUID clientId, String username, Channel channel) {
        this.clientId = clientId;
        this.username = username;
        this.channel = channel;
        this.authenticated = true;
    }
    
    public UUID getClientId() {
        return clientId;
    }
    
    public String getUsername() {
        return username;
    }
    
    public Channel getChannel() {
        return channel;
    }
    
    public boolean isAuthenticated() {
        return authenticated;
    }
    
    public void disconnect() {
        authenticated = false;
        if (channel != null && channel.isActive()) {
            channel.close();
        }
    }
    
    public boolean isConnected() {
        return channel != null && channel.isActive();
    }
}
