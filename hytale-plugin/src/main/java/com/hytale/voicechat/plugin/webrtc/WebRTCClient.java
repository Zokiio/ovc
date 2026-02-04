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
    private volatile boolean speaking = false; // VAD state
    /**
     * Microphone mute status. When true, the client's microphone is muted.
     * Note: This is sent to other clients as "isMuted" in signaling messages,
     * which represents microphone mute (not speaker/output mute).
     */
    private volatile boolean muted = false;
    private volatile int volume = 100; // 0-200%
    
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
    
    public boolean isSpeaking() {
        return speaking;
    }
    
    public void setSpeaking(boolean speaking) {
        this.speaking = speaking;
    }
    
    /**
     * Returns whether this client's microphone is muted.
     * Note: This value is transmitted to other clients as "isMuted" in signaling messages.
     * The client-side uses "isMicMuted" for microphone mute and "isMuted" for speaker/output mute.
     * @return true if the client's microphone is muted, false otherwise
     */
    public boolean isMuted() {
        return muted;
    }
    
    /**
     * Sets whether this client's microphone is muted.
     * @param muted true to mute the client's microphone, false to unmute
     */
    public void setMuted(boolean muted) {
        this.muted = muted;
    }
    
    public int getVolume() {
        return volume;
    }
    
    public void setVolume(int volume) {
        // Clamp volume between 0 and 200%
        this.volume = Math.max(0, Math.min(200, volume));
    }
    
    public void sendMessage(String message) {
        if (!isConnected()) {
            return;
        }
        
        try {
            channel.writeAndFlush(new TextWebSocketFrame(message));
        } catch (Exception e) {
            // Silently fail
        }
    }
    
    /**
     * Send audio data to this WebRTC client via WebSocket
     * 
     * @param senderId The UUID of the sender (for client to know who's speaking)
     * @param audioData The audio data to send
     */
    public void sendAudio(UUID senderId, byte[] audioData) {
        if (!isConnected()) {
            return;
        }
        
        try {
            // Wrap binary audio data in a signaling message
            JsonObject data = new JsonObject();
            // Encode audio data as base64 for JSON transmission
            String encodedAudio = java.util.Base64.getEncoder().encodeToString(audioData);
            data.addProperty("audioData", encodedAudio);
            data.addProperty("senderId", senderId.toString());
            
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
