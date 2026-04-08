package com.zottik.ovc.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.bouncycastle.jce.provider.BouncyCastleProvider;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages WebRTC peer connections (Ice4j-based, DataChannel-first).
 */
public class WebRTCPeerManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    public interface IceCandidateListener {
        void onLocalCandidate(UUID clientId, String candidate, String sdpMid, int sdpMLineIndex);
        void onIceGatheringComplete(UUID clientId);
    }

    static {
        java.security.Security.addProvider(new BouncyCastleProvider());
        Ice4jRuntimeConfig.initialize(logger);
    }

    private final Map<UUID, WebRTCPeerSession> sessions = new ConcurrentHashMap<>();
    private final Map<UUID, List<PendingIceCandidate>> pendingIceCandidates = new ConcurrentHashMap<>();
    private final List<String> stunServers;
    private final DataChannelAudioHandler audioHandler;
    private IceCandidateListener iceCandidateListener;

    public WebRTCPeerManager(List<String> stunServers, DataChannelAudioHandler audioHandler) {
        this.stunServers = stunServers;
        this.audioHandler = audioHandler;
    }

    public void setIceCandidateListener(IceCandidateListener listener) {
        this.iceCandidateListener = listener;
    }

    /**
     * Create a peer connection for the given client and return the SDP answer.
     *
     * @param clientId The web client UUID.
     * @param offerSdp The SDP offer from the browser.
     * @return SDP answer to send back to the client.
     */
    public String createPeerConnection(UUID clientId, String offerSdp) {
        WebRTCPeerSession existing = sessions.remove(clientId);
        if (existing != null) {
            existing.close();
        }

        WebRTCPeerSession session = new WebRTCPeerSession(
            clientId,
            offerSdp,
            stunServers,
            audioHandler,
            iceCandidateListener
        );
        sessions.put(clientId, session);
        logger.atInfo().log("Created WebRTC peer session: " + clientId);
        flushPendingIceCandidates(clientId, session);
        return session.getAnswerSdp();
    }

    /**
     * Handle a trickled ICE candidate from the client.
     */
    public void handleIceCandidate(UUID clientId, String candidate, String sdpMid, int sdpMLineIndex) {
        WebRTCPeerSession session = sessions.get(clientId);
        if (session == null) {
            pendingIceCandidates
                .computeIfAbsent(clientId, key -> new ArrayList<>())
                .add(new PendingIceCandidate(candidate, sdpMid, sdpMLineIndex));
            logger.atInfo().log("Buffered ICE candidate for client " + clientId + " (pending session)");
            return;
        }
        session.addRemoteCandidate(candidate, sdpMid, sdpMLineIndex);
    }

    public void handleIceCandidateComplete(UUID clientId) {
        WebRTCPeerSession session = sessions.get(clientId);
        if (session != null) {
            session.handleRemoteCandidatesComplete();
        }
    }

    /**
     * Close and remove a peer connection.
     */
    public void closePeerConnection(UUID clientId) {
        WebRTCPeerSession session = sessions.remove(clientId);
        if (session != null) {
            session.close();
            logger.atInfo().log("Closed WebRTC peer session: " + clientId);
        }
        pendingIceCandidates.remove(clientId);
    }

    /**
     * Attempt to start DTLS/SCTP/DataChannel transport for a client.
     * Requires ICE to have a selected pair on the datachannel component.
     */
    public void startDataChannelTransport(UUID clientId) {
        WebRTCPeerSession session = sessions.get(clientId);
        if (session == null) {
            logger.atWarning().log("Cannot start DataChannel transport; session not found for client " + clientId);
            return;
        }
        long startTime = System.currentTimeMillis();
        logger.atInfo().log("Initiating DataChannel transport for client " + clientId);
        session.startDataChannelTransport();
        long duration = System.currentTimeMillis() - startTime;
        logger.atInfo().log("DataChannel transport initialization completed in " + duration + "ms for client " + clientId);
    }

    private void flushPendingIceCandidates(UUID clientId, WebRTCPeerSession session) {
        List<PendingIceCandidate> pending = pendingIceCandidates.remove(clientId);
        if (pending == null || pending.isEmpty()) {
            return;
        }

        logger.atInfo().log("Flushing " + pending.size() + " buffered ICE candidates for client " + clientId);
        for (PendingIceCandidate candidate : pending) {
            session.addRemoteCandidate(candidate.candidate(), candidate.sdpMid(), candidate.sdpMLineIndex());
        }
    }

    private record PendingIceCandidate(String candidate, String sdpMid, int sdpMLineIndex) {
    }

    public boolean hasSession(UUID clientId) {
        return sessions.containsKey(clientId);
    }

    public List<String> getStunServers() {
        return stunServers;
    }

    public DataChannelAudioHandler getAudioHandler() {
        return audioHandler;
    }
}
