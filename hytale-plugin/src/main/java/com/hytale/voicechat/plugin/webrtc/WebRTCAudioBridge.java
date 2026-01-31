package com.hytale.voicechat.plugin.webrtc;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.logger.HytaleLogger;

import java.util.*;
import java.util.concurrent.*;

/**
 * Bridges audio between WebRTC clients for proximity-based voice chat
 * 
 * Responsibilities:
 * - Receive audio from WebRTC clients
 * - Route to nearby players based on proximity
 * - Handle audio buffering and processing
 */
public class WebRTCAudioBridge {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final PlayerPositionTracker positionTracker;
    private final Map<UUID, WebRTCClient> clients;
    private GroupStateManager groupStateManager;
    private GroupManager groupManager;
    
    // Audio buffering and routing
    private final BlockingQueue<AudioFrame> audioQueue;
    private ExecutorService audioProcessingExecutor;
    private volatile boolean running = false;
    
    // Proximity distance in blocks
    private double proximityDistance = NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;
    
    public WebRTCAudioBridge(Object ignored, PlayerPositionTracker positionTracker, 
                            Map<UUID, WebRTCClient> clients) {
        this.positionTracker = positionTracker;
        this.clients = clients;
        this.audioQueue = new LinkedBlockingQueue<>(1000); // Buffer up to 1000 frames
    }
    
    public void setGroupStateManager(GroupStateManager stateManager) {
        this.groupStateManager = stateManager;
    }
    
    public void setGroupManager(GroupManager groupManager) {
        this.groupManager = groupManager;
    }
    
    /**
     * Start the audio bridge processing
     */
    public void start() {
        if (running) {
            logger.atWarning().log("Audio bridge already running");
            return;
        }
        
        running = true;
        audioProcessingExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "WebRTC-AudioBridge");
            t.setDaemon(true);
            return t;
        });
        
        // Start audio processing thread
        audioProcessingExecutor.submit(this::processAudioQueue);
        
        logger.atInfo().log("WebRTC audio bridge started");
    }
    
    /**
     * Stop the audio bridge
     */
    public void shutdown() {
        running = false;
        
        if (audioProcessingExecutor != null) {
            audioProcessingExecutor.shutdown();
            try {
                if (!audioProcessingExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                    audioProcessingExecutor.shutdownNow();
                }
            } catch (InterruptedException e) {
                audioProcessingExecutor.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }
        
        audioQueue.clear();
        logger.atInfo().log("WebRTC audio bridge stopped");
    }
    
    /**
     * Receive audio from a WebRTC client
     * 
     * @param clientId The client ID
     * @param audioData The raw audio data
     */
    public void receiveAudioFromWebRTC(UUID clientId, byte[] audioData) {
        if (!running || audioData == null || audioData.length == 0) {
            return;
        }
        
        // Per-packet logging disabled for performance (was causing audio stutters)
        // Uncomment for debugging audio flow:
        // logger.atFine().log("Received " + audioData.length + " bytes from client: " + clientId);
        
        AudioFrame frame = new AudioFrame(clientId, audioData, System.currentTimeMillis());
        
        // Try to add to queue, drop if full (prefer real-time over buffering)
        if (!audioQueue.offer(frame)) {
            logger.atWarning().log("Audio queue full, dropping frame from client: " + clientId);
        }
    }
    
    /**
     * Process audio queue and route to nearby players
     */
    private void processAudioQueue() {
        logger.atInfo().log("Audio processing thread started");
        
        while (running) {
            try {
                AudioFrame frame = audioQueue.poll(100, TimeUnit.MILLISECONDS);
                if (frame == null) {
                    continue;
                }
                
                logger.atFine().log("Processing audio frame from " + frame.clientId);
                
                // Get sender position
                PlayerPosition senderPosition = positionTracker.getPlayerPosition(frame.clientId);
                if (senderPosition == null) {
                    logger.atFine().log("Sender position not found: " + frame.clientId);
                    continue;
                }
                
                // Route to nearby WebRTC clients
                routeAudioToNearbyWebRTC(senderPosition, frame.audioData);
                
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                logger.atSevere().log("Error processing audio frame", e);
            }
        }
        
        logger.atInfo().log("Audio processing thread stopped");
    }
    
    /**
     * Route audio to nearby WebRTC clients
     * Supports both group-based routing and proximity-based routing
     */
    private void routeAudioToNearbyWebRTC(PlayerPosition senderPosition, byte[] audioData) {
        UUID senderId = senderPosition.getPlayerId();
        
        // Check if sender is in a group
        if (groupStateManager != null) {
            UUID groupId = groupStateManager.getClientGroup(senderId);
            if (groupId != null && groupManager != null) {
                // Route within group with proximity filtering
                routeAudioToGroup(groupId, senderId, senderPosition, audioData);
                return;
            }
        }
        
        // Fallback: proximity-based routing
        routeAudioByProximity(senderId, senderPosition, audioData);
    }
    
    /**
     * Route audio within a group with proximity filtering
     */
    private void routeAudioToGroup(UUID groupId, UUID senderId, PlayerPosition senderPosition, byte[] audioData) {
        if (groupStateManager == null || groupManager == null) {
            return;
        }
        
        var group = groupManager.getGroup(groupId);
        if (group == null) {
            return;
        }
        
        double proximityRange = group.getSettings().getProximityRange();
        List<WebRTCClient> groupMembers = groupStateManager.getGroupClients(groupId);
        
        for (WebRTCClient client : groupMembers) {
            // Skip self
            if (client.getClientId().equals(senderId)) {
                continue;
            }
            
            PlayerPosition clientPosition = positionTracker.getPlayerPosition(client.getClientId());
            if (clientPosition == null) {
                continue;
            }
            
            // Check if within group proximity
            double distance = senderPosition.distanceTo(clientPosition);
            
            if (distance <= proximityRange && distance != Double.MAX_VALUE) {
                logger.atFine().log("Sending audio to group member: " + client.getUsername() + " (distance: " + distance + ")");
                routeAudioToWebRTC(client.getClientId(), audioData);
            }
        }
    }
    
    /**
     * Route audio by proximity (for non-group players)
     */
    private void routeAudioByProximity(UUID senderId, PlayerPosition senderPosition, byte[] audioData) {
        for (WebRTCClient client : clients.values()) {
            // Skip self
            if (client.getClientId().equals(senderId)) {
                continue;
            }
            
            PlayerPosition clientPosition = positionTracker.getPlayerPosition(client.getClientId());
            if (clientPosition == null) {
                continue;
            }
            
            // Check if within proximity
            double distance = senderPosition.distanceTo(clientPosition);
            
            if (distance <= proximityDistance && distance != Double.MAX_VALUE) {
                logger.atFine().log("Sending audio to WebRTC client: " + client.getUsername() + " (distance: " + distance + ")");
                routeAudioToWebRTC(client.getClientId(), audioData);
            }
        }
    }
    
    /**
     * Send audio to a specific WebRTC client
     */
    private void routeAudioToWebRTC(UUID clientId, byte[] audioData) {
        WebRTCClient client = clients.get(clientId);
        if (client == null) {
            return;
        }
        
        // Send via data channel or WebSocket
        client.sendAudio(audioData);
    }
    
    /**
     * Set proximity distance for audio routing
     */
    public void setProximityDistance(double distance) {
        this.proximityDistance = distance;
        logger.atInfo().log("Proximity distance set to: " + distance + " blocks");
    }
    
    /**
     * Get current proximity distance
     */
    public double getProximityDistance() {
        return proximityDistance;
    }
    
    /**
     * Check if bridge is running
     */
    public boolean isRunning() {
        return running;
    }
    
    /**
     * Internal class for audio frame
     */
    private static class AudioFrame {
        final UUID clientId;
        final byte[] audioData;
        final long timestamp;
        
        AudioFrame(UUID clientId, byte[] audioData, long timestamp) {
            this.clientId = clientId;
            this.audioData = audioData;
            this.timestamp = timestamp;
        }
    }
}
