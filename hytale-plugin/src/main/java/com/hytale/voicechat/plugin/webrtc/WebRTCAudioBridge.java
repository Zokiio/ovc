package com.hytale.voicechat.plugin.webrtc;

import com.hytale.voicechat.common.model.PlayerPosition;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.plugin.GroupManager;
import com.hytale.voicechat.plugin.tracker.PlayerPositionTracker;
import com.hypixel.hytale.logger.HytaleLogger;

import java.nio.charset.StandardCharsets;
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
    private DataChannelAudioHandler dataChannelAudioHandler;
    private ClientIdMapper clientIdMapper;
    /**
     * Version of the binary audio payload format sent over the WebRTC data channel.
     * <p>
     * This is a monotonically increasing wire-format version. It must be bumped
     * whenever the on-wire layout or semantics of the audio payload change in a
     * way that is not backward compatible with older clients, for example:
     * <ul>
     *   <li>Adding, removing or reordering header fields.</li>
     *   <li>Changing field sizes, types, or their meaning.</li>
     *   <li>Changing framing (e.g. per-frame metadata layout) or assumed codec
     *       parameters that affect how payload bytes are interpreted.</li>
     * </ul>
     * Non-breaking internal changes (refactoring, logging, buffering, or other
     * logic that does not alter the serialized bytes) do not require changing
     * this version.
     */
    private static final byte AUDIO_PAYLOAD_VERSION = 1;
    private static final int DATA_CHANNEL_MAX_PAYLOAD = 900;
    
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

    public void setDataChannelAudioHandler(DataChannelAudioHandler handler) {
        this.dataChannelAudioHandler = handler;
    }

    public void setClientIdMapper(ClientIdMapper mapper) {
        this.clientIdMapper = mapper;
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
                    // Within proximity range: apply spatial volume with minimum floor
                    // Outside proximity range: use full volume (global voice)
                    if (distance <= proximityRange) {
                        logger.atFine().log("Sending audio to group member (proximity+spatial): " + client.getUsername() + " (distance: " + distance + ")");
                        routeAudioToWebRTCWithMinVolume(senderId, client.getClientId(), audioData, distance, proximityRange);
                    } else {
                        // Outside proximity: full volume for global group voice
                        logger.atFine().log("Sending audio to group member (global): " + client.getUsername() + " (distance: " + distance + ")");
                        routeAudioToWebRTCFullVolume(senderId, client.getClientId(), audioData);
                    }
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
        byte[] processedAudio = audioData;
        
        // Apply server-side volume scaling if enabled
        if (NetworkConfig.isServerSideVolumeEnabled()) {
            double volumeMultiplier = calculateVolumeMultiplier(distance, maxRange);
            if (volumeMultiplier < 1.0) {
                processedAudio = scaleAudioVolume(audioData, volumeMultiplier);
            }
        }
        
        // Send via data channel or WebSocket
        sendAudioToClient(senderId, recipientId, processedAudio);
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
        // Send at full volume without any processing
        sendAudioToClient(senderId, recipientId, audioData);
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
        sendAudioToClient(senderId, recipientId, processedAudio);
    }

    private void sendAudioToClient(UUID senderId, UUID recipientId, byte[] audioData) {
        String senderToken = clientIdMapper != null ? clientIdMapper.getObfuscatedId(senderId) : senderId.toString();
        if (dataChannelAudioHandler != null) {
            boolean sent = sendAudioOverDataChannel(recipientId, senderToken, audioData);
            if (sent) {
                return;
            }
        }

        WebRTCClient client = clients.get(recipientId);
        if (client != null) {
            client.sendAudio(senderToken, audioData);
        }
    }

    private boolean sendAudioOverDataChannel(UUID recipientId, String senderToken, byte[] audioData) {
        if (senderToken == null || senderToken.isEmpty() || audioData == null || audioData.length == 0) {
            return false;
        }
        if (dataChannelAudioHandler == null || !dataChannelAudioHandler.isClientOpen(recipientId)) {
            return false;
        }

        byte[] senderBytes = senderToken.getBytes(StandardCharsets.UTF_8);
        if (senderBytes.length > 255) {
            return false;
        }

        int headerSize = 2 + senderBytes.length;
        int maxChunkSize = DATA_CHANNEL_MAX_PAYLOAD - headerSize;
        if (maxChunkSize <= 0) {
            return false;
        }

        // Ensure we send at most one complete audio frame per DataChannel message.
        // If the frame is too large to fit in a single payload, skip sending it to
        // avoid fragmenting over an unordered/unreliable channel.
        if (audioData.length > maxChunkSize) {
            return false;
        }

        byte[] payload = new byte[headerSize + audioData.length];
        payload[0] = AUDIO_PAYLOAD_VERSION;
        payload[1] = (byte) senderBytes.length;
        System.arraycopy(senderBytes, 0, payload, 2, senderBytes.length);
        System.arraycopy(audioData, 0, payload, headerSize, audioData.length);

        return dataChannelAudioHandler.sendToClient(recipientId, payload);
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
     * Scales proportionally with maxRange parameter to ensure consistent behavior
     * regardless of proximity settings (30m, 50m, 100m, etc.)
     * 
     * @param distance Current distance to the listener
     * @param maxRange Maximum hearing range
     * @return Volume multiplier between 0.0 and 1.0
     */
    private double calculateVolumeMultiplier(double distance, double maxRange) {
        // Scale fade start proportionally to max range using configured ratio
        // Default: 0.7 means fade starts at 70% of max range (e.g., 35m for 50m range)
        double scaledFadeStart = maxRange * NetworkConfig.PROXIMITY_FADE_START_RATIO;
        
        // Within fade start distance = full volume
        if (distance <= scaledFadeStart) {
            return 1.0;
        }
        
        // Beyond max range = silent
        if (distance >= maxRange) {
            return 0.0;
        }
        
        // Calculate fade zone (from scaledFadeStart to maxRange)
        double fadeZone = maxRange - scaledFadeStart;
        double positionInFadeZone = distance - scaledFadeStart;
        
        // Normalized position in fade zone (0.0 at start, 1.0 at end)
        double normalizedPosition = positionInFadeZone / fadeZone;
        
        // Apply rolloff curve (use instance variable for consistency)
        // rolloffFactor = 1.0 -> linear fade
        // rolloffFactor = 1.5 -> moderate curve (default)
        // rolloffFactor = 2.0 -> quadratic (faster falloff)
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
