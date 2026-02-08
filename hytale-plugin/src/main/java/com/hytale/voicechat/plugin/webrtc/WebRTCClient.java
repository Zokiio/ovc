package com.hytale.voicechat.plugin.webrtc;

import io.netty.channel.Channel;
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame;

import java.util.UUID;

/**
 * Represents a connected WebRTC client
 */
public class WebRTCClient {
    public static final String AUDIO_CODEC_PCM = "pcm";
    public static final String AUDIO_CODEC_OPUS = "opus";

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
    private volatile boolean pendingGameSession = false;
    private volatile String sessionId;
    private volatile String resumeToken;
    private volatile long lastHeartbeatAt;
    private volatile String negotiatedAudioCodec = AUDIO_CODEC_PCM;
    
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

    /**
     * Whether this client is waiting for a matching in-game session.
     */
    public boolean isPendingGameSession() {
        return pendingGameSession;
    }

    public void setPendingGameSession(boolean pendingGameSession) {
        this.pendingGameSession = pendingGameSession;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public String getResumeToken() {
        return resumeToken;
    }

    public void setResumeToken(String resumeToken) {
        this.resumeToken = resumeToken;
    }

    public long getLastHeartbeatAt() {
        return lastHeartbeatAt;
    }

    public void setLastHeartbeatAt(long lastHeartbeatAt) {
        this.lastHeartbeatAt = lastHeartbeatAt;
    }

    public String getNegotiatedAudioCodec() {
        return negotiatedAudioCodec;
    }

    public void setNegotiatedAudioCodec(String negotiatedAudioCodec) {
        if (AUDIO_CODEC_OPUS.equalsIgnoreCase(negotiatedAudioCodec)) {
            this.negotiatedAudioCodec = AUDIO_CODEC_OPUS;
            return;
        }
        this.negotiatedAudioCodec = AUDIO_CODEC_PCM;
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
