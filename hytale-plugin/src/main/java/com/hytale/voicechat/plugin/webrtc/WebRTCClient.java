package com.hytale.voicechat.plugin.webrtc;

import com.google.gson.JsonObject;
import com.hytale.voicechat.common.signaling.SignalingMessage;
import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

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
    
    /**
     * Send audio data to this WebRTC client via WebSocket
     * 
     * @param audioData The audio data to send
     */
    public void sendAudio(byte[] audioData) {
        if (!isConnected()) {
            return;
        }
        
        try {
            // Wrap binary audio data in a signaling message
            JsonObject data = new JsonObject();
            // Encode audio data as base64 for JSON transmission
            String encodedAudio = java.util.Base64.getEncoder().encodeToString(audioData);
            data.addProperty("audioData", encodedAudio);
            
            SignalingMessage message = new SignalingMessage("audio", data);
            channel.writeAndFlush(new TextWebSocketFrame(message.toJson()));
            // Note: Silent success - audio sent successfully
        } catch (Exception e) {
            // Silently fail to avoid spamming logs
        }
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
