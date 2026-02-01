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
    
    // Volume scaling settings
    private double fadeStartDistance = NetworkConfig.PROXIMITY_FADE_START;
    private double rolloffFactor = NetworkConfig.PROXIMITY_ROLLOFF_FACTOR;
    
    public WebRTCAudioBridge(Object ignored, PlayerPositionTracker positionTracker, 
                            Map<UUID, WebRTCClient> clients) {
        this.positionTracker = positionTracker;
        this.clients = clients;
        this.audioQueue = new LinkedBlockingQueue<>(1000); // Buffer up to 1000 frames
        
        // Load settings from config
        this.proximityDistance = NetworkConfig.getDefaultProximityDistance();
        this.fadeStartDistance = NetworkConfig.getProximityFadeStart();
        this.rolloffFactor = NetworkConfig.getProximityRolloffFactor();
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
     * Route audio within a group
     * If GroupGlobalVoice is enabled, all group members hear each other regardless of distance
     * If GroupSpatialAudio is enabled, volume scales with distance for realistic spatial audio
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
        boolean isGlobalVoice = NetworkConfig.isGroupGlobalVoice();
        boolean isSpatialAudio = NetworkConfig.isGroupSpatialAudio();
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
            
            double distance = senderPosition.distanceTo(clientPosition);
            if (distance == Double.MAX_VALUE) {
                continue; // Different worlds, skip
            }
            
            if (isGlobalVoice) {
                // Global voice: always send to all group members
                if (isSpatialAudio) {
                    // Apply spatial volume based on distance
                    // Use max voice distance for scaling so volume fades over longer distance
                    double maxRange = NetworkConfig.getMaxVoiceDistance();
                    logger.atFine().log("Sending audio to group member (global+spatial): " + client.getUsername() + " (distance: " + distance + ")");
                    routeAudioToWebRTCWithMinVolume(senderId, client.getClientId(), audioData, distance, maxRange);
                } else {
                    // Full volume, no spatial audio
                    logger.atFine().log("Sending audio to group member (global): " + client.getUsername() + " (distance: " + distance + ")");
                    routeAudioToWebRTCFullVolume(senderId, client.getClientId(), audioData);
                }
            } else {
                // Legacy behavior: proximity-based filtering for groups
                if (distance <= proximityRange) {
                    logger.atFine().log("Sending audio to group member (proximity): " + client.getUsername() + " (distance: " + distance + ")");
                    routeAudioToWebRTC(senderId, client.getClientId(), audioData, distance, proximityRange);
                }
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
                routeAudioToWebRTC(senderId, client.getClientId(), audioData, distance, proximityDistance);
            }
        }
    }
    
    /**
     * Send audio to a specific WebRTC client with distance-based volume adjustment
     * 
     * @param senderId The sender's client ID
     * @param recipientId The recipient's client ID
     * @param audioData The audio data
     * @param distance The distance between sender and recipient
     * @param maxRange The maximum range for this audio
     */
    private void routeAudioToWebRTC(UUID senderId, UUID recipientId, byte[] audioData, double distance, double maxRange) {
        WebRTCClient client = clients.get(recipientId);
        if (client == null) {
            return;
        }
        
        byte[] processedAudio = audioData;
        
        // Apply server-side volume scaling if enabled
        if (NetworkConfig.isServerSideVolumeEnabled()) {
            double volumeMultiplier = calculateVolumeMultiplier(distance, maxRange);
            if (volumeMultiplier < 1.0) {
                processedAudio = scaleAudioVolume(audioData, volumeMultiplier);
            }
        }
        
        // Send via data channel or WebSocket
        client.sendAudio(senderId, processedAudio);
    }
    
    /**
     * Send audio to a specific WebRTC client at full volume (no distance-based adjustment)
     * Used for global group voice without spatial audio
     * 
     * @param senderId The sender's client ID
     * @param recipientId The recipient's client ID
     * @param audioData The audio data
     */
    private void routeAudioToWebRTCFullVolume(UUID senderId, UUID recipientId, byte[] audioData) {
        WebRTCClient client = clients.get(recipientId);
        if (client == null) {
            return;
        }
        
        // Send at full volume without any processing
        client.sendAudio(senderId, audioData);
    }
    
    /**
     * Send audio to a specific WebRTC client with distance-based volume adjustment
     * but with a minimum volume floor (for global group voice with spatial audio)
     * 
     * @param senderId The sender's client ID
     * @param recipientId The recipient's client ID
     * @param audioData The audio data
     * @param distance The distance between sender and recipient
     * @param maxRange The maximum range for volume scaling
     */
    private void routeAudioToWebRTCWithMinVolume(UUID senderId, UUID recipientId, byte[] audioData, double distance, double maxRange) {
        WebRTCClient client = clients.get(recipientId);
        if (client == null) {
            return;
        }
        
        byte[] processedAudio = audioData;
        
        // Apply server-side volume scaling if enabled
        if (NetworkConfig.isServerSideVolumeEnabled()) {
            double volumeMultiplier = calculateVolumeMultiplier(distance, maxRange);
            // For global groups, enforce a minimum volume so they're always audible
            double minVolume = NetworkConfig.getGroupMinVolume();
            volumeMultiplier = Math.max(minVolume, volumeMultiplier);
            
            if (volumeMultiplier < 1.0) {
                processedAudio = scaleAudioVolume(audioData, volumeMultiplier);
            }
        }
        
        // Send via data channel or WebSocket
        client.sendAudio(senderId, processedAudio);
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
     * Calculate volume multiplier based on distance
     * 
     * @param distance Current distance to the listener
     * @param maxRange Maximum hearing range
     * @return Volume multiplier between 0.0 and 1.0
     */
    private double calculateVolumeMultiplier(double distance, double maxRange) {
        // Within fade start distance = full volume
        if (distance <= fadeStartDistance) {
            return 1.0;
        }
        
        // Beyond max range = silent
        if (distance >= maxRange) {
            return 0.0;
        }
        
        // Calculate fade zone (from fadeStartDistance to maxRange)
        double fadeZone = maxRange - fadeStartDistance;
        double positionInFadeZone = distance - fadeStartDistance;
        
        // Normalized position in fade zone (0.0 at start, 1.0 at end)
        double normalizedPosition = positionInFadeZone / fadeZone;
        
        // Apply rolloff curve
        // rolloffFactor = 1.0 -> linear
        // rolloffFactor = 2.0 -> quadratic (faster falloff)
        // rolloffFactor = 0.5 -> square root (slower falloff)
        double volumeMultiplier = 1.0 - Math.pow(normalizedPosition, rolloffFactor);
        
        // Clamp to valid range
        return Math.max(0.0, Math.min(1.0, volumeMultiplier));
    }
    
    /**
     * Scale audio volume by multiplying PCM samples
     * Assumes 16-bit signed PCM audio (little-endian)
     * 
     * @param audioData Original audio data
     * @param volumeMultiplier Volume scale (0.0 to 1.0)
     * @return Scaled audio data
     */
    private byte[] scaleAudioVolume(byte[] audioData, double volumeMultiplier) {
        if (volumeMultiplier >= 1.0) {
            return audioData;
        }
        
        if (volumeMultiplier <= 0.0) {
            // Return silence
            return new byte[audioData.length];
        }
        
        byte[] scaledData = new byte[audioData.length];
        
        // Process as 16-bit little-endian PCM samples
        for (int i = 0; i < audioData.length - 1; i += 2) {
            // Read 16-bit sample (little-endian)
            int sample = (audioData[i] & 0xFF) | (audioData[i + 1] << 8);
            
            // Scale the sample
            sample = (int) (sample * volumeMultiplier);
            
            // Clamp to prevent overflow
            sample = Math.max(-32768, Math.min(32767, sample));
            
            // Write back (little-endian)
            scaledData[i] = (byte) (sample & 0xFF);
            scaledData[i + 1] = (byte) ((sample >> 8) & 0xFF);
        }
        
        return scaledData;
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
