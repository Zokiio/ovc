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
    // Keep flow logs useful but avoid high-volume spam in normal operation.
    private static final long FLOW_LOG_INTERVAL_MS = 30000L;
    private static final long BACKPRESSURE_COOLDOWN_MS = 250L;
    private static final long BACKPRESSURE_LOG_INTERVAL_MS = 5000L;

    public interface DataChannelSender {
        boolean isOpen();
        SendResult send(byte[] audioData);
    }

    public enum SendResult {
        SUCCESS,
        BACKPRESSURED,
        CLOSED,
        ERROR
    }

    private final WebRTCAudioBridge audioBridge;
    private final Map<UUID, DataChannelSender> senders = new ConcurrentHashMap<>();
    private final Map<UUID, FlowLogState> inboundFlow = new ConcurrentHashMap<>();
    private final Map<UUID, FlowLogState> outboundFlow = new ConcurrentHashMap<>();
    private final Map<UUID, BackpressureState> backpressure = new ConcurrentHashMap<>();

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
        backpressure.remove(clientId);
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
     * Send audio payload to a specific client via its DataChannel sender.
     * The payload includes a header (version + sender ID) plus PCM audio bytes.
     */
    public boolean sendToClient(UUID clientId, byte[] audioPayload) {
        DataChannelSender sender = senders.get(clientId);
        if (sender == null || !sender.isOpen()) {
            backpressure.remove(clientId);
            return false;
        }

        BackpressureState pressure = backpressure.computeIfAbsent(clientId, id -> new BackpressureState());
        long now = System.currentTimeMillis();
        long cooldownUntil = pressure.cooldownUntilAt.get();
        if (now < cooldownUntil) {
            pressure.droppedDuringCooldown.incrementAndGet();
            maybeLogBackpressure(clientId, pressure, now);
            return false;
        }

        SendResult result = sender.send(audioPayload);
        switch (result) {
            case SUCCESS:
                pressure.cooldownUntilAt.set(0);
                recordFlow(outboundFlow, clientId, audioPayload.length, "outbound");
                return true;
            case BACKPRESSURED:
                pressure.backpressureEvents.incrementAndGet();
                pressure.cooldownUntilAt.set(now + BACKPRESSURE_COOLDOWN_MS);
                maybeLogBackpressure(clientId, pressure, now);
                return false;
            case CLOSED:
                senders.remove(clientId, sender);
                backpressure.remove(clientId);
                return false;
            case ERROR:
            default:
                return false;
        }
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
                logger.atFine().log(
                    "DataChannel audio " + direction + " for client " + clientId +
                        ": packets=" + packetCount + ", bytes=" + byteCount +
                        " (last " + (FLOW_LOG_INTERVAL_MS / 1000) + "s)"
                );
            }
        }
    }

    private void maybeLogBackpressure(UUID clientId, BackpressureState state, long now) {
        long last = state.lastLogAt.get();
        if (now - last < BACKPRESSURE_LOG_INTERVAL_MS || !state.lastLogAt.compareAndSet(last, now)) {
            return;
        }

        long queueFullCount = state.backpressureEvents.getAndSet(0);
        long droppedCount = state.droppedDuringCooldown.getAndSet(0);
        logger.atWarning().log(
            "DataChannel backpressure for client %s: queueFull=%d, dropped=%d, cooldown=%dms",
            clientId,
            queueFullCount,
            droppedCount,
            BACKPRESSURE_COOLDOWN_MS
        );
    }

    private static final class FlowLogState {
        private final AtomicLong lastLogAt = new AtomicLong(0);
        private final AtomicLong packets = new AtomicLong(0);
        private final AtomicLong bytes = new AtomicLong(0);
    }

    private static final class BackpressureState {
        private final AtomicLong lastLogAt = new AtomicLong(0);
        private final AtomicLong cooldownUntilAt = new AtomicLong(0);
        private final AtomicLong backpressureEvents = new AtomicLong(0);
        private final AtomicLong droppedDuringCooldown = new AtomicLong(0);
    }
}
