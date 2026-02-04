package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Handles DataChannel audio I/O for WebRTC clients.
 *
 * This class acts as a bridge between DataChannel transport and the
 * proximity-based routing in {@link WebRTCAudioBridge}.
 */
public class DataChannelAudioHandler {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    public interface DataChannelSender {
        boolean isOpen();
        void send(byte[] audioData);
    }

    private final WebRTCAudioBridge audioBridge;
    private final Map<UUID, DataChannelSender> senders = new ConcurrentHashMap<>();

    public DataChannelAudioHandler(WebRTCAudioBridge audioBridge) {
        this.audioBridge = audioBridge;
    }

    /**
     * Register a DataChannel sender for a connected client.
     */
    public void registerClient(UUID clientId, DataChannelSender sender) {
        senders.put(clientId, sender);
        logger.atInfo().log("DataChannel sender registered for client: " + clientId);
    }

    /**
     * Unregister a client and stop sending audio to it.
     */
    public void unregisterClient(UUID clientId) {
        senders.remove(clientId);
        logger.atInfo().log("DataChannel sender unregistered for client: " + clientId);
    }

    /**
     * Receive Opus audio from a client and forward to the audio bridge.
     */
    public void receiveFromClient(UUID clientId, byte[] opusFrame) {
        if (audioBridge == null) {
            logger.atWarning().log("Audio bridge not set; dropping audio from client: " + clientId);
            return;
        }
        audioBridge.receiveAudioFromWebRTC(clientId, opusFrame);
    }

    /**
     * Send Opus audio to a specific client via its DataChannel sender.
     */
    public void sendToClient(UUID clientId, byte[] opusFrame) {
        DataChannelSender sender = senders.get(clientId);
        if (sender == null || !sender.isOpen()) {
            return;
        }
        sender.send(opusFrame);
    }
}
