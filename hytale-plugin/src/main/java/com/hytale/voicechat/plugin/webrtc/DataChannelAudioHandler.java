package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Handles DataChannel audio I/O for WebRTC clients.
 *
 * This class acts as a bridge between DataChannel transport and the
 * proximity-based routing in {@link WebRTCAudioBridge}.
 */
public class DataChannelAudioHandler {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final long FLOW_LOG_INTERVAL_MS = 5000L;

    public interface DataChannelSender {
        boolean isOpen();
        void send(byte[] audioData);
    }

    private final WebRTCAudioBridge audioBridge;
    private final Map<UUID, DataChannelSender> senders = new ConcurrentHashMap<>();
    private final Map<UUID, FlowLogState> inboundFlow = new ConcurrentHashMap<>();
    private final Map<UUID, FlowLogState> outboundFlow = new ConcurrentHashMap<>();

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
        inboundFlow.remove(clientId);
        outboundFlow.remove(clientId);
        logger.atInfo().log("DataChannel sender unregistered for client: " + clientId);
    }

    /**
     * Receive PCM audio from a client and forward to the audio bridge.
     */
    public void receiveFromClient(UUID clientId, byte[] pcmFrame) {
        if (audioBridge == null) {
            logger.atWarning().log("Audio bridge not set; dropping audio from client: " + clientId);
            return;
        }
        recordFlow(inboundFlow, clientId, pcmFrame.length, "inbound");
        audioBridge.receiveAudioFromWebRTC(clientId, pcmFrame);
    }

    /**
     * Send PCM audio to a specific client via its DataChannel sender.
     */
    public boolean sendToClient(UUID clientId, byte[] pcmFrame) {
        DataChannelSender sender = senders.get(clientId);
        if (sender == null || !sender.isOpen()) {
            return false;
        }
        sender.send(pcmFrame);
        recordFlow(outboundFlow, clientId, opusFrame.length, "outbound");
        return true;
    }

    public boolean isClientOpen(UUID clientId) {
        DataChannelSender sender = senders.get(clientId);
        return sender != null && sender.isOpen();
    }

    private void recordFlow(Map<UUID, FlowLogState> flowMap, UUID clientId, int bytes, String direction) {
        FlowLogState state = flowMap.computeIfAbsent(clientId, id -> new FlowLogState());
        state.packets.incrementAndGet();
        state.bytes.addAndGet(bytes);

        long now = System.currentTimeMillis();
        long last = state.lastLogAt.get();
        if (now - last >= FLOW_LOG_INTERVAL_MS && state.lastLogAt.compareAndSet(last, now)) {
            long packetCount = state.packets.getAndSet(0);
            long byteCount = state.bytes.getAndSet(0);
            if (packetCount > 0) {
                logger.atInfo().log(
                    "DataChannel audio " + direction + " for client " + clientId +
                        ": packets=" + packetCount + ", bytes=" + byteCount +
                        " (last " + (FLOW_LOG_INTERVAL_MS / 1000) + "s)"
                );
            }
        }
    }

    private static final class FlowLogState {
        private final AtomicLong lastLogAt = new AtomicLong(0);
        private final AtomicLong packets = new AtomicLong(0);
        private final AtomicLong bytes = new AtomicLong(0);
    }
}
