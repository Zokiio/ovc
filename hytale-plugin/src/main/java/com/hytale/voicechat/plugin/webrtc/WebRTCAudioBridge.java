package com.hytale.voicechat.plugin.webrtc;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.common.packet.AudioPacket;
import com.hytale.voicechat.plugin.network.UDPSocketManager;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.logger.HytaleLogger;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Bridges audio between WebRTC clients and UDP voice chat system
 * 
 * Responsibilities:
 * - Receive audio from WebRTC clients
 * - Convert to UDP AudioPacket format
 * - Route to nearby players based on proximity
 * - Receive audio from UDP and route to WebRTC clients
 */
public class WebRTCAudioBridge {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final UDPSocketManager udpManager;
    private final PlayerPositionTracker positionTracker;
    private final Map<UUID, WebRTCClient> clients;
    
    // Audio buffering and routing
    private final BlockingQueue<AudioFrame> audioQueue;
    private ExecutorService audioProcessingExecutor;
    private volatile boolean running = false;
    
    // Proximity distance in blocks
    private double proximityDistance = NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;
    
    // Sequence number tracking for audio packets
    private final AtomicInteger sequenceNumber = new AtomicInteger(0);
    
    public WebRTCAudioBridge(UDPSocketManager udpManager, PlayerPositionTracker positionTracker, 
                            Map<UUID, WebRTCClient> clients) {
        this.udpManager = udpManager;
        this.positionTracker = positionTracker;
        this.clients = clients;
        this.audioQueue = new LinkedBlockingQueue<>(1000); // Buffer up to 1000 frames
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
        
        logger.atInfo().log("AUDIO TEST: Received " + audioData.length + " bytes from WebRTC client: " + clientId);
        
        AudioFrame frame = new AudioFrame(clientId, audioData, System.currentTimeMillis());
        
        // Try to add to queue, drop if full (prefer real-time over buffering)
        if (!audioQueue.offer(frame)) {
            logger.atInfo().log("AUDIO TEST: Audio queue full, dropping frame from client: " + clientId);
        } else {
            logger.atInfo().log("AUDIO TEST: Queued audio frame for processing");
        }
    }
    
    /**
     * Receive audio from UDP and route to WebRTC clients
     * This is called by UDPSocketManager when it receives audio from a native client
     * 
     * @param audioPacket The audio packet from UDP
     */
    public void receiveAudioFromUDP(AudioPacket audioPacket) {
        if (!running) {
            return;
        }
        
        UUID senderId = audioPacket.getSenderId();
        byte[] audioData = audioPacket.getAudioData();
        
        // Get sender position
        PlayerPosition senderPosition = positionTracker.getPlayerPosition(senderId);
        if (senderPosition == null) {
            return; // Sender not found in tracker
        }
        
        // Route to nearby WebRTC clients
        for (WebRTCClient client : clients.values()) {
            PlayerPosition clientPosition = positionTracker.getPlayerPosition(client.getClientId());
            if (clientPosition == null) {
                continue; // Client position not available
            }
            
            // Check if within proximity
            double distance = senderPosition.distanceTo(clientPosition);
            if (distance <= proximityDistance && distance != Double.MAX_VALUE) {
                routeAudioToWebRTC(client.getClientId(), audioData);
            }
        }
    }
    
    /**
     * Process audio queue and route to nearby players
     */
    private void processAudioQueue() {
        logger.atInfo().log("AUDIO TEST: Audio processing thread started");
        
        while (running) {
            try {
                AudioFrame frame = audioQueue.poll(100, TimeUnit.MILLISECONDS);
                if (frame == null) {
                    continue;
                }
                
                logger.atInfo().log("AUDIO TEST: Processing audio frame of " + frame.audioData.length + " bytes from " + frame.clientId);
                
                // Get sender position
                PlayerPosition senderPosition = positionTracker.getPlayerPosition(frame.clientId);
                if (senderPosition == null) {
                    logger.atInfo().log("AUDIO TEST: Sender position not found: " + frame.clientId);
                    continue;
                }
                
                logger.atInfo().log("AUDIO TEST: Sender at position (" + senderPosition.getX() + ", " + senderPosition.getY() + ", " + senderPosition.getZ() + ")");
                
                // Convert WebRTC audio to AudioPacket format
                // In real implementation, would need proper Opus encoding
                AudioPacket packet = new AudioPacket(frame.clientId, (byte)0, frame.audioData, sequenceNumber.incrementAndGet());
                
                // Route to UDP (native clients)
                if (udpManager != null) {
                    logger.atInfo().log("AUDIO TEST: Routing to UDP clients");
                    routeAudioToUDP(senderPosition, packet);
                }
                
                // Also route to nearby WebRTC clients
                logger.atInfo().log("AUDIO TEST: Routing to nearby WebRTC clients");
                routeAudioToNearbyWebRTC(senderPosition, frame.audioData);
                
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                logger.atSevere().log("Error processing audio frame", e);
            }
        }
        
        logger.atInfo().log("AUDIO TEST: Audio processing thread stopped");
    }
    
    /**
     * Route audio to all UDP clients within proximity
     */
    private void routeAudioToUDP(PlayerPosition senderPosition, AudioPacket packet) {
        // Get all active players from tracker
        Map<UUID, PlayerPosition> allPositions = positionTracker.getPlayerPositions();
        
        logger.atInfo().log("AUDIO TEST: Checking " + allPositions.size() + " players for proximity");
        
        for (PlayerPosition position : allPositions.values()) {
            // Skip self
            if (position.getPlayerId().equals(senderPosition.getPlayerId())) {
                continue;
            }
            
            // Check if within proximity (uses world-aware distance)
            double distance = senderPosition.distanceTo(position);
            logger.atInfo().log("AUDIO TEST: Player " + position.getPlayerName() + " at distance " + distance + " blocks (proximity=" + proximityDistance + ")");
            
            if (distance <= proximityDistance && distance != Double.MAX_VALUE) {
                // Send to UDP client - would need to route through UDPSocketManager
                // For now, this is a placeholder
                logger.atInfo().log("AUDIO TEST: Would route audio to UDP client at distance " + distance);
            }
        }
    }
    
    /**
     * Route audio to nearby WebRTC clients
     */
    private void routeAudioToNearbyWebRTC(PlayerPosition senderPosition, byte[] audioData) {
        logger.atInfo().log("AUDIO TEST: Checking " + clients.size() + " WebRTC clients for proximity");
        
        for (WebRTCClient client : clients.values()) {
            // Skip self
            if (client.getClientId().equals(senderPosition.getPlayerId())) {
                logger.atInfo().log("AUDIO TEST: Skipping self");
                continue;
            }
            
            PlayerPosition clientPosition = positionTracker.getPlayerPosition(client.getClientId());
            if (clientPosition == null) {
                logger.atInfo().log("AUDIO TEST: Client " + client.getClientId() + " position not found");
                continue;
            }
            
            // Check if within proximity
            double distance = senderPosition.distanceTo(clientPosition);
            logger.atInfo().log("AUDIO TEST: WebRTC client " + client.getUsername() + " at distance " + distance + " blocks");
            
            if (distance <= proximityDistance && distance != Double.MAX_VALUE) {
                logger.atInfo().log("AUDIO TEST: Sending audio to WebRTC client: " + client.getUsername());
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
            logger.atInfo().log("AUDIO TEST: Client not found: " + clientId);
            return;
        }
        
        // Send via data channel or WebSocket
        logger.atInfo().log("AUDIO TEST: Sending " + audioData.length + " bytes to WebRTC client: " + client.getUsername());
        client.sendAudio(audioData);
        logger.atInfo().log("AUDIO TEST: Successfully sent audio to: " + client.getUsername());
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
