package com.zottik.ovc.plugin.webrtc;

import com.zottik.ovc.common.model.PlayerPosition;
import com.zottik.ovc.common.network.NetworkConfig;
import com.zottik.ovc.plugin.GroupManager;
import com.zottik.ovc.plugin.tracker.PlayerPositionTracker;
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
    private DataChannelAudioHandler dataChannelAudioHandler;
    private ClientIdMapper clientIdMapper;
    private final AudioGainProcessor gainProcessor;
    private volatile AudioRoutingEngine routingEngine;
    private volatile AudioPayloadEncoder payloadEncoder;
    
    // Audio buffering and routing
    private final BlockingQueue<AudioFrame> audioQueue;
    private ExecutorService audioProcessingExecutor;
    private volatile boolean running = false;
    
    // Proximity distance in blocks
    private double proximityDistance = NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;
    
    public WebRTCAudioBridge(PlayerPositionTracker positionTracker,
                            Map<UUID, WebRTCClient> clients) {
        this.positionTracker = positionTracker;
        this.clients = clients;
        this.audioQueue = new LinkedBlockingQueue<>(1000); // Buffer up to 1000 frames
        
        // Load settings from config
        this.proximityDistance = NetworkConfig.getDefaultProximityDistance();
        this.gainProcessor = new AudioGainProcessor(NetworkConfig.getProximityRolloffFactor());
        this.payloadEncoder = new AudioPayloadEncoder(dataChannelAudioHandler);
        rebuildRoutingEngine();
    }
    
    public void setGroupStateManager(GroupStateManager stateManager) {
        this.groupStateManager = stateManager;
        rebuildRoutingEngine();
    }
    
    public void setGroupManager(GroupManager groupManager) {
        this.groupManager = groupManager;
        rebuildRoutingEngine();
    }

    public void setDataChannelAudioHandler(DataChannelAudioHandler handler) {
        this.dataChannelAudioHandler = handler;
        this.payloadEncoder = new AudioPayloadEncoder(handler);
    }

    public void setClientIdMapper(ClientIdMapper mapper) {
        this.clientIdMapper = mapper;
    }

    private AudioCodecType resolveSenderCodec(UUID clientId) {
        WebRTCClient client = clients.get(clientId);
        if (client == null) {
            return AudioCodecType.PCM;
        }
        return AudioCodecType.fromClientCodec(client.getNegotiatedAudioCodec());
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
        
        AudioCodecType codec = resolveSenderCodec(clientId);
        AudioFrame frame = new AudioFrame(clientId, audioData, codec, System.currentTimeMillis());
        
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
                routeAudioToNearbyWebRTC(senderPosition, frame);
                
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
    private void routeAudioToNearbyWebRTC(PlayerPosition senderPosition, AudioFrame frame) {
        UUID senderId = senderPosition.getPlayerId();
        AudioRoutingEngine localRoutingEngine = routingEngine;
        if (localRoutingEngine == null) {
            rebuildRoutingEngine();
            localRoutingEngine = routingEngine;
            if (localRoutingEngine == null) {
                return;
            }
        }
        
        // Check if sender is in a group
        if (groupStateManager != null && groupManager != null) {
            UUID groupId = groupStateManager.getClientGroup(senderId);
            if (groupId != null) {
                var group = groupManager.getGroup(groupId);
                if (group == null) {
                    routeProximityTargets(
                        localRoutingEngine.computeProximityTargets(senderId, senderPosition, Collections.emptySet()),
                        senderId,
                        frame.audioData,
                        frame.codec
                    );
                    return;
                }

                // Always route within the sender's group.
                List<AudioRoutingTarget> groupTargets = localRoutingEngine.computeGroupTargets(groupId, senderId, senderPosition);
                for (AudioRoutingTarget target : groupTargets) {
                    switch (target.mode()) {
                        case FULL_VOLUME -> routeAudioToWebRTCFullVolume(
                            senderId,
                            target.recipientId(),
                            frame.audioData,
                            frame.codec,
                            target.distance(),
                            target.maxRange()
                        );
                        case MIN_VOLUME -> routeAudioToWebRTCWithMinVolume(
                            senderId,
                            target.recipientId(),
                            frame.audioData,
                            frame.codec,
                            target.distance(),
                            target.maxRange()
                        );
                        case NORMAL -> routeAudioToWebRTC(
                            senderId,
                            target.recipientId(),
                            frame.audioData,
                            frame.codec,
                            target.distance(),
                            target.maxRange()
                        );
                    }
                }

                // Hybrid mode: also route to nearby non-group clients.
                if (!group.isIsolated()) {
                    Set<UUID> excludedRecipients = localRoutingEngine.buildGroupExclusionSet(senderId, groupId);
                    routeProximityTargets(
                        localRoutingEngine.computeProximityTargets(senderId, senderPosition, excludedRecipients),
                        senderId,
                        frame.audioData,
                        frame.codec
                    );
                }
                return;
            }
        }
        
        // Fallback: proximity-based routing
        routeProximityTargets(
            localRoutingEngine.computeProximityTargets(senderId, senderPosition, Collections.emptySet()),
            senderId,
            frame.audioData,
            frame.codec
        );
    }

    private void routeProximityTargets(
            List<AudioRoutingTarget> targets,
            UUID senderId,
            byte[] audioData,
            AudioCodecType codec
    ) {
        for (AudioRoutingTarget target : targets) {
            routeAudioToWebRTC(
                senderId,
                target.recipientId(),
                audioData,
                codec,
                target.distance(),
                target.maxRange()
            );
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
    private void routeAudioToWebRTC(UUID senderId, UUID recipientId, byte[] audioData, AudioCodecType codec, double distance, double maxRange) {
        double gain = 1.0;
        byte[] processedAudio = audioData;

        if (NetworkConfig.isServerSideVolumeEnabled()) {
            gain = gainProcessor.calculateVolumeMultiplier(distance, maxRange);
            if (codec == AudioCodecType.PCM && gain < 1.0) {
                processedAudio = gainProcessor.scalePcmVolume(audioData, gain);
            }
        }

        sendAudioToClient(
            senderId,
            recipientId,
            processedAudio,
            codec,
            buildProximityMetadata(distance, maxRange),
            buildGainMetadata(codec, gain)
        );
    }
    
    /**
     * Send audio to a specific WebRTC client at full volume (no distance-based adjustment)
     * Used for global group voice without spatial audio
     * 
     * @param senderId The sender's client ID
     * @param recipientId The recipient's client ID
     * @param audioData The audio data
     */
    private void routeAudioToWebRTCFullVolume(UUID senderId, UUID recipientId, byte[] audioData, AudioCodecType codec, double distance, double maxRange) {
        sendAudioToClient(
            senderId,
            recipientId,
            audioData,
            codec,
            buildProximityMetadata(distance, maxRange),
            buildGainMetadata(codec, 1.0)
        );
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
    private void routeAudioToWebRTCWithMinVolume(UUID senderId, UUID recipientId, byte[] audioData, AudioCodecType codec, double distance, double maxRange) {
        double gain = 1.0;
        byte[] processedAudio = audioData;

        if (NetworkConfig.isServerSideVolumeEnabled()) {
            gain = gainProcessor.calculateVolumeMultiplier(distance, maxRange);
            double minVolume = NetworkConfig.getGroupMinVolume();
            gain = Math.max(minVolume, gain);
            if (codec == AudioCodecType.PCM && gain < 1.0) {
                processedAudio = gainProcessor.scalePcmVolume(audioData, gain);
            }
        }

        sendAudioToClient(
            senderId,
            recipientId,
            processedAudio,
            codec,
            buildProximityMetadata(distance, maxRange),
            buildGainMetadata(codec, gain)
        );
    }

    private AudioProximityMetadata buildProximityMetadata(double distance, double maxRange) {
        if (!NetworkConfig.isProximityRadarEnabled()) {
            return null;
        }
        if (!Double.isFinite(distance) || !Double.isFinite(maxRange) || maxRange <= 0.0) {
            return null;
        }
        return new AudioProximityMetadata(distance, maxRange);
    }

    private AudioGainMetadata buildGainMetadata(AudioCodecType codec, double gain) {
        if (codec != AudioCodecType.OPUS || !Double.isFinite(gain)) {
            return null;
        }
        return new AudioGainMetadata(gain);
    }

    private void sendAudioToClient(
            UUID senderId,
            UUID recipientId,
            byte[] audioData,
            AudioCodecType codec,
            AudioProximityMetadata proximityMetadata,
            AudioGainMetadata gainMetadata
    ) {
        String senderToken = clientIdMapper != null ? clientIdMapper.getObfuscatedId(senderId) : senderId.toString();
        AudioPayloadEncoder localPayloadEncoder = payloadEncoder;
        if (localPayloadEncoder == null) {
            localPayloadEncoder = new AudioPayloadEncoder(dataChannelAudioHandler);
            payloadEncoder = localPayloadEncoder;
        }
        AudioCodecType recipientCodec = resolveSenderCodec(recipientId);
        boolean sent = localPayloadEncoder.sendAudio(
            recipientId,
            senderToken,
            audioData,
            codec,
            recipientCodec,
            proximityMetadata,
            gainMetadata
        );
        if (!sent) {
            logger.atFine().log("Dropping audio frame for client " + recipientId + " (DataChannel unavailable)");
        }
    }
    
    /**
     * Set proximity distance for audio routing
     */
    public void setProximityDistance(double distance) {
        this.proximityDistance = distance;
        rebuildRoutingEngine();
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

    private void rebuildRoutingEngine() {
        this.routingEngine = new AudioRoutingEngine(
            positionTracker,
            clients,
            groupStateManager,
            groupManager,
            proximityDistance
        );
    }
    
    
    /**
     * Internal class for audio frame
     */
    private static class AudioFrame {
        final UUID clientId;
        final byte[] audioData;
        final AudioCodecType codec;
        final long timestamp;
        
        AudioFrame(UUID clientId, byte[] audioData, AudioCodecType codec, long timestamp) {
            this.clientId = clientId;
            this.audioData = audioData;
            this.codec = codec;
            this.timestamp = timestamp;
        }
    }
}
