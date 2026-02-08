package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import com.typesafe.config.Config;
import com.typesafe.config.ConfigFactory;
import com.hytale.voicechat.common.network.NetworkConfig;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.ice4j.Transport;
import org.ice4j.TransportAddress;
import org.ice4j.ice.Agent;
import org.ice4j.ice.Component;
import org.ice4j.ice.IceMediaStream;
import org.ice4j.ice.IceProcessingState;
import org.ice4j.ice.LocalCandidate;
import org.ice4j.ice.RemoteCandidate;
import org.ice4j.ice.harvest.StunCandidateHarvester;
import org.ice4j.ice.harvest.TrickleCallback;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.NoSuchProviderException;
import java.security.PrivateKey;
import java.security.cert.CertificateEncodingException;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Manages WebRTC peer connections (Ice4j-based, DataChannel-first).
 */
public class WebRTCPeerManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    public interface IceCandidateListener {
        void onLocalCandidate(UUID clientId, String candidate, String sdpMid, int sdpMLineIndex);
        void onIceGatheringComplete(UUID clientId);
    }
    
    // Initialize BouncyCastle provider and Ice4j configuration
    static {
        java.security.Security.addProvider(new BouncyCastleProvider());
        
        // Load our reference.conf explicitly using our classloader before Ice4j initializes
        // Invalidate any cached config and force reload with our classloader
        try {
            ConfigFactory.invalidateCaches();
            // Set the thread context classloader to ensure Ice4j finds our config
            Thread currentThread = Thread.currentThread();
            ClassLoader originalClassLoader = currentThread.getContextClassLoader();
            currentThread.setContextClassLoader(WebRTCPeerManager.class.getClassLoader());
            
            Config config = ConfigFactory.load(WebRTCPeerManager.class.getClassLoader());
            logger.atInfo().log("Loaded Typesafe Config with ice4j settings from reference.conf");
            
            // Restore original classloader
            currentThread.setContextClassLoader(originalClassLoader);
        } catch (Exception e) {
            logger.atWarning().log("Failed to load Typesafe Config: " + e.getMessage());
        }
        
        // Configure Ice4j before any Agent creation
        // These properties support multiple naming conventions used by Jitsi MetaConfig
        // Source: https://github.com/jitsi/ice4j/blob/master/src/main/resources/reference.conf
        try {
            // ===== CONSENT FRESHNESS (RFC7675) =====
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_INTERVAL", "30000");
            System.setProperty("ice4j.consent-freshness.interval", "30000");
            
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_ORIGINAL_INTERVAL", "5000");
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_WAIT_INTERVAL", "5000");
            System.setProperty("ice4j.consent-freshness.original-wait-interval", "5000");
            
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_MAX_WAIT_INTERVAL", "10000");
            System.setProperty("ice4j.consent-freshness.max-wait-interval", "10000");
            
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_MAX_RETRANSMISSIONS", "3");
            System.setProperty("ice4j.consent-freshness.max-retransmissions", "3");
            
            System.setProperty("ice4j.consent-freshness.randomize-interval", "true");
            
            // ===== TERMINATION AND CHECK LIST =====
            System.setProperty("org.ice4j.TERMINATION_DELAY", "3000");
            System.setProperty("ice4j.ice.termination-delay", "3000");
            
            System.setProperty("org.ice4j.MAX_CHECK_LIST_SIZE", "100");
            System.setProperty("ice4j.ice.max-check-list-size", "100");
            
            // ===== AGENT CONFIGURATION =====
            System.setProperty("org.ice4j.ice.USE_COMPONENT_SOCKET", "true");
            System.setProperty("ice4j.use-component-socket", "true");
            
            System.setProperty("org.ice4j.REDACT_REMOTE_ADDRESSES", "false");
            System.setProperty("ice4j.redact-remote-addresses", "false");
            
            System.setProperty("org.ice4j.SOFTWARE", "ice4j.org");
            System.setProperty("ice4j.software", "ice4j.org");
            
            System.setProperty("ice4j.send-to-last-received-from-address", "false");
            
            // ===== HARVEST: LINK-LOCAL AND IPv6 =====
            System.setProperty("org.ice4j.ice.harvest.DISABLE_LINK_LOCAL_ADDRESSES", "false");
            System.setProperty("ice4j.harvest.use-link-local-addresses", "true");
            
            System.setProperty("org.ice4j.ipv6.DISABLED", "false");
            System.setProperty("ice4j.harvest.use-ipv6", "true");
            
            // ===== HARVEST: TIMEOUTS =====
            System.setProperty("org.ice4j.ice.harvest.HARVESTING_TIMEOUT", "15000");
            System.setProperty("ice4j.harvest.timeout", "15000");
            
            // ===== HARVEST: UDP CONFIGURATION =====
            System.setProperty("org.ice4j.ice.harvest.USE_DYNAMIC_HOST_HARVESTER", "true");
            System.setProperty("ice4j.harvest.udp.use-dynamic-ports", "true");
            
            System.setProperty("org.ice4j.ice.harvest.AbstractUdpListener.SO_RCVBUF", "0");
            System.setProperty("ice4j.harvest.udp.receive-buffer-size", "0");
            
            System.setProperty("ice4j.harvest.udp.socket-pool-size", "0");
            
            // ===== HARVEST: INTERFACE MANAGEMENT =====
            System.setProperty("org.ice4j.ice.harvest.ALLOWED_INTERFACES", "");
            System.setProperty("ice4j.harvest.allowed-interfaces", "");
            
            System.setProperty("org.ice4j.ice.harvest.BLOCKED_INTERFACES", "");
            System.setProperty("ice4j.harvest.blocked-interfaces", "");
            
            // ===== HARVEST: IP ADDRESS MANAGEMENT =====
            System.setProperty("org.ice4j.ice.harvest.ALLOWED_ADDRESSES", "");
            System.setProperty("ice4j.harvest.allowed-addresses", "");
            
            System.setProperty("org.ice4j.ice.harvest.BLOCKED_ADDRESSES", "");
            System.setProperty("ice4j.harvest.blocked-addresses", "");
            
            // ===== HARVEST: AWS HARVESTER =====
            System.setProperty("org.ice4j.ice.harvest.DISABLE_AWS_HARVESTER", "true");
            System.setProperty("ice4j.harvest.mapping.aws.enabled", "false");
            
            System.setProperty("org.ice4j.ice.harvest.FORCE_AWS_HARVESTER", "false");
            System.setProperty("ice4j.harvest.mapping.aws.force", "false");
            
            // ===== HARVEST: STUN AND UPnP SERVERS =====
            System.setProperty("ice4j.harvest.stun.enabled", "true");
            System.setProperty("ice4j.harvest.upnp.enabled", "false");
            
            logger.atInfo().log("Ice4j system properties configured");
        } catch (Exception e) {
            logger.atWarning().log("Failed to configure Ice4j properties: " + e.getMessage());
        }

        // Quiet the noisy ICE "Completed -> Terminated" transition log.
        try {
            java.util.logging.Logger iceAgentLogger = java.util.logging.Logger.getLogger("org.ice4j.ice.Agent");
            iceAgentLogger.setFilter(record -> {
                String message = record.getMessage();
                return message == null || !message.contains("ICE state changed from Completed to Terminated");
            });
        } catch (Exception e) {
            logger.atWarning().log("Failed to install ICE log filter: " + e.getMessage());
        }
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
        WebRTCPeerSession session = new WebRTCPeerSession(clientId, offerSdp);
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

    /**
     * Session container with Ice4j Agent for ICE/STUN negotiation.
     */
    private class WebRTCPeerSession {
        private final UUID clientId;
        private final String offerSdp;
        private final String answerSdp;
        private final Agent iceAgent;
        private final IceMediaStream audioStream;
        private final IceMediaStream datachannelStream;
        private final boolean hasAudioMLine;
        private final boolean hasApplicationMLine;
        private final X509Certificate dtlsCertificate;
        private final String dtlsFingerprint;
        private PrivateKey dtlsPrivateKey;
        private final AtomicReference<Short> audioStreamId = new AtomicReference<>(null);
        private DtlsTransport dtlsTransport;
        private SctpTransport sctpTransport;
        private DataChannelManager dataChannelManager;
        private String audioMid;
        private String datachannelMid;
        private int audioMLineIndex = -1;
        private int dataMLineIndex = -1;

        WebRTCPeerSession(UUID clientId, String offerSdp) {
            this.clientId = clientId;
            this.offerSdp = offerSdp;
            this.hasAudioMLine = hasMediaLine(offerSdp, "m=audio");
            this.hasApplicationMLine = hasMediaLine(offerSdp, "m=application");
            
            try {
                // Set context classloader to ensure Ice4j finds our config files
                Thread currentThread = Thread.currentThread();
                ClassLoader originalClassLoader = currentThread.getContextClassLoader();
                currentThread.setContextClassLoader(WebRTCPeerManager.class.getClassLoader());
                
                // Invalidate caches to ensure fresh config load with our classloader
                ConfigFactory.invalidateCaches();
                ConfigFactory.load(WebRTCPeerManager.class.getClassLoader());
                
                // Create Ice4j Agent with controlling role (server controls candidate nomination)
                this.iceAgent = new Agent();
                this.iceAgent.setControlling(true);
                this.iceAgent.setTrickling(true);
                this.iceAgent.setUseDynamicPorts(true);
                
                // Restore original classloader
                currentThread.setContextClassLoader(originalClassLoader);
                
                logger.atInfo().log("Created Ice4j Agent with controlling role for client " + clientId);

                if (!hasApplicationMLine) {
                    throw new IllegalArgumentException("SDP offer is missing required application m-line");
                }
                
                // Add STUN harvesters for both audio and datachannel components
                for (String stunServerUrl : stunServers) {
                    try {
                        // Parse STUN server URL: "stun:stun.l.google.com:19302"
                        String[] parts = stunServerUrl.replaceFirst("stun:", "").split(":");
                        if (parts.length >= 2) {
                            String stunHost = parts[0];
                            int stunPort = Integer.parseInt(parts[1]);
                            TransportAddress stunAddress = new TransportAddress(stunHost, stunPort, 
                                org.ice4j.Transport.UDP);
                            
                            StunCandidateHarvester harvester = new StunCandidateHarvester(stunAddress);
                            iceAgent.addCandidateHarvester(harvester);
                            logger.atInfo().log("Added STUN harvester: " + stunHost + ":" + stunPort);
                        }
                    } catch (Exception e) {
                        logger.atWarning().log("Failed to add STUN harvester " + stunServerUrl + ": " + e.getMessage());
                    }
                }
                
                // Create media streams conditionally based on offer m-lines.
                this.audioStream = hasAudioMLine ? iceAgent.createMediaStream("audio") : null;
                this.datachannelStream = iceAgent.createMediaStream("application");
                
                logger.atInfo().log("Created Ice4j media streams for client " + clientId +
                    " (audio=" + hasAudioMLine + ", application=" + hasApplicationMLine + ")");
                if (audioStream != null) {
                    logger.atInfo().log("Audio stream components: " + audioStream.getComponentCount());
                }
                logger.atInfo().log("Application stream components: " + datachannelStream.getComponentCount());
                
                // Create ICE components so candidate harvesting can begin
                if (audioStream != null) {
                    Component audioComp = createComponentWithFallback(audioStream, "audio", 0);
                    if (audioComp != null) {
                        logger.atInfo().log("Audio RTP component created and available");
                    } else {
                        logger.atWarning().log("Audio RTP component not available (candidate harvesting may fail)");
                    }
                }

                int applicationPortOffset = audioStream != null ? 1 : 0;
                Component datachannelComp = createComponentWithFallback(datachannelStream, "application", applicationPortOffset);
                if (datachannelComp != null) {
                    logger.atInfo().log("Application RTP component created and available");
                } else {
                    logger.atWarning().log("Application RTP component not available (candidate harvesting may fail)");
                }
                
                // Generate DTLS certificate and fingerprint for this session
                try {
                    this.dtlsCertificate = generateSelfSignedCertificate();
                    this.dtlsFingerprint = generateDtlsFingerprint(dtlsCertificate);
                    logger.atInfo().log("Generated DTLS certificate with fingerprint for client " + clientId);
                } catch (Exception e) {
                    logger.atSevere().log("Failed to generate DTLS certificate: " + e.getMessage());
                    throw new RuntimeException("DTLS certificate generation failed", e);
                }
                
                // Candidate gathering happens asynchronously when components are created
                // For SFU scenario, we rely on STUN harvesters to discover local candidates
                logger.atInfo().log("ICE candidate gathering initialized for client " + clientId);

                // Apply remote ICE credentials from offer
                applyRemoteIceCredentials(offerSdp);
                
                // Generate SDP answer with real ICE credentials
                this.answerSdp = this.createAnswerSdp(offerSdp);
                addRemoteCandidatesFromOffer(offerSdp);
                startCandidateTrickle();
                
            } catch (Exception e) {
                logger.atSevere().log("Failed to initialize Ice4j Agent for client " + clientId + ": " + e.getMessage());
                throw new RuntimeException("Ice4j initialization failed", e);
            }
        }

        String getAnswerSdp() {
            return answerSdp;
        }
        
        Agent getIceAgent() {
            return iceAgent;
        }
        
        IceMediaStream getAudioStream() {
            return audioStream;
        }
        
        IceMediaStream getDatachannelStream() {
            return datachannelStream;
        }

        void addRemoteCandidate(String candidate, String sdpMid, int sdpMLineIndex) {
            try {
                // In SFU mode (Server-Forwarding Unit), we primarily focus on:
                // 1. Server gathers its own local candidates via STUN harvesters
                // 2. Browser connects to server's candidates
                // 3. Remote (browser) candidates are secondary - processed for completeness

                if (candidate == null || candidate.isEmpty()) {
                    return;
                }

                String candidateLine = candidate;
                if (candidateLine.startsWith("a=")) {
                    candidateLine = candidateLine.substring(2);
                }
                if (candidateLine.startsWith("candidate:")) {
                    candidateLine = candidateLine.substring("candidate:".length());
                }

                String[] parts = candidateLine.split(" ");
                if (parts.length < 8) {
                    logger.atWarning().log("Invalid ICE candidate format for client " + clientId + ": " + candidate);
                    return;
                }

                String foundation = parts[0];
                int componentId = Integer.parseInt(parts[1]);
                String transport = parts[2];
                long priority = Long.parseLong(parts[3]);
                String address = parts[4];
                int port = Integer.parseInt(parts[5]);
                String type = parts[7];

                if (!"udp".equalsIgnoreCase(transport)) {
                    logger.atFine().log("Skipping non-UDP ICE candidate for client " + clientId + ": " + transport);
                    return;
                }

                IceMediaStream targetStream = resolveStreamForCandidate(sdpMid, sdpMLineIndex);
                if (targetStream == null) {
                    logger.atWarning().log("No ICE stream available for candidate on client " + clientId);
                    return;
                }

                Component component = targetStream.getComponent(componentId);
                if (component == null) {
                    logger.atWarning().log("ICE component " + componentId + " not available for stream " + targetStream.getName());
                    return;
                }

                TransportAddress transportAddress = new TransportAddress(address, port, Transport.UDP);
                RemoteCandidate remoteCandidate = new RemoteCandidate(
                    transportAddress,
                    component,
                    mapCandidateType(type),
                    foundation,
                    priority,
                    null
                );

                if (iceAgent.getState() == IceProcessingState.RUNNING || iceAgent.getState().isEstablished()) {
                    component.addUpdateRemoteCandidates(remoteCandidate);
                } else {
                    component.addRemoteCandidate(remoteCandidate);
                }

                if (iceAgent.getState() == IceProcessingState.WAITING) {
                    iceAgent.startConnectivityEstablishment();
                }
            } catch (Exception e) {
                logger.atWarning().log("Failed to process ICE candidate: " + e.getMessage());
            }
        }

        void handleRemoteCandidatesComplete() {
            logger.atInfo().log("Remote ICE candidates complete for client " + clientId);
        }

        void close() {
            try {
                if (dataChannelManager != null && audioHandler != null) {
                    audioHandler.unregisterClient(clientId);
                }
                if (sctpTransport != null) {
                    sctpTransport.close();
                }
                if (dtlsTransport != null) {
                    dtlsTransport.close();
                }
                if (iceAgent != null) {
                    iceAgent.free();
                    logger.atInfo().log("Freed Ice4j Agent resources for client " + clientId);
                }
            } catch (Exception e) {
                logger.atWarning().log("Error closing Ice4j Agent: " + e.getMessage());
            }
        }

        /**
         * Start DTLS + SCTP transport for the datachannel stream and wire audio handlers.
         * NOTE: Requires ICE selected pair to be established on the datachannel component.
         */
        void startDataChannelTransport() {
            if (dtlsTransport != null || sctpTransport != null) {
                logger.atWarning().log("DataChannel transport already started for client " + clientId);
                return;
            }

            logger.atInfo().log("Waiting for Ice4j datachannel component to be created...");
            // Wait for datachannel component to be created by harvesters
            // Components are created during candidate gathering (async process)
            // Increase timeout to 10 seconds for slow network environments
            Component dataComponent = waitForComponent(datachannelStream, 1, 10000);
            if (dataComponent == null) {
                int componentCount = 0;
                for (int i = 1; i <= 5; i++) {
                    if (datachannelStream.getComponent(i) != null) {
                        componentCount++;
                    }
                }
                logger.atSevere().log(
                    "DataChannel transport unavailable: Ice4j component not ready after 10s " +
                    "(found " + componentCount + " components)"
                );
                return;
            }

            logger.atInfo().log("Using Ice4j component for datachannel transport with client " + clientId);
            org.bouncycastle.tls.DatagramTransport transport = new Ice4jDatagramTransport(dataComponent);

            dtlsTransport = new DtlsTransport(clientId.toString(), dtlsCertificate, dtlsPrivateKey, true);
            final org.bouncycastle.tls.DatagramTransport finalTransport = transport;

            dtlsTransport.setHandshakeListener(new DtlsTransport.DtlsHandshakeListener() {
                @Override
                public void onHandshakeComplete() {
                    logger.atInfo().log("DTLS handshake completed successfully for client " + clientId);
                    sctpTransport = new SctpTransport(clientId.toString(), dtlsTransport);
                    dataChannelManager = new DataChannelManager(clientId.toString(), sctpTransport);

                    dataChannelManager.setListener(new DataChannelManager.DataChannelListener() {
                        @Override
                        public void onChannelOpen(DataChannelManager.DataChannel channel) {
                            if (!"audio".equalsIgnoreCase(channel.label)) {
                                return;
                            }

                            logger.atInfo().log("Audio DataChannel opened for client " + clientId + " (stream " + channel.streamId + ")");
                            audioStreamId.set(channel.streamId);
                            channel.open = true;

                            if (audioHandler != null) {
                                audioHandler.registerClient(clientId, new DataChannelAudioHandler.DataChannelSender() {
                                    @Override
                                    public boolean isOpen() {
                                        return channel.open;
                                    }

                                    @Override
                                    public void send(byte[] audioData) {
                                        Short streamId = audioStreamId.get();
                                        if (streamId != null) {
                                            dataChannelManager.sendBinary(streamId, audioData);
                                        }
                                    }
                                });
                            }
                        }

                        @Override
                        public void onBinaryMessage(short streamId, byte[] payload) {
                            Short audioId = audioStreamId.get();
                            if (audioId != null && audioId == streamId && audioHandler != null) {
                                audioHandler.receiveFromClient(clientId, payload);
                            }
                        }

                        @Override
                        public void onStringMessage(short streamId, String payload) {
                            // No-op for audio channel
                        }
                    });

                    sctpTransport.setListener(new SctpTransport.SctpTransportListener() {
                        @Override
                        public void onConnected() {
                            logger.atInfo().log("SCTP connected for client " + clientId);
                        }

                        @Override
                        public void onClosed() {
                            logger.atInfo().log("SCTP closed for client " + clientId);
                        }

                        @Override
                        public void onMessageReceived(short streamId, int ppid, byte[] payload) {
                            if (dataChannelManager != null) {
                                dataChannelManager.handleSctpMessage(streamId, ppid, payload);
                            }
                        }

                        @Override
                        public void onError(Exception error) {
                            logger.atSevere().log("SCTP transport error for client " + clientId + ": " + error.getMessage());
                        }
                    });

                    sctpTransport.start(5000, 5000);
                }

                @Override
                public void onHandshakeFailed(Exception error) {
                    logger.atSevere().log("DTLS handshake failed for client " + clientId + ": " + error.getMessage());
                }
            });

            new Thread(() -> {
                long dtlsStartTime = System.currentTimeMillis();
                try {
                    logger.atInfo().log("Starting DTLS handshake for client " + clientId);
                    dtlsTransport.startHandshake(finalTransport);
                    long dtlsDuration = System.currentTimeMillis() - dtlsStartTime;
                    logger.atInfo().log("DTLS handshake initiated (duration: " + dtlsDuration + "ms) for client " + clientId);
                } catch (IOException e) {
                    logger.atSevere().log("DTLS handshake error for client " + clientId + ": " + e.getMessage());
                }
            }, "dtls-handshake-" + clientId).start();
        }

        private void startCandidateTrickle() {
            if (iceCandidateListener == null) {
                return;
            }

            try {
                iceAgent.startCandidateTrickle(new TrickleCallback() {
                    @Override
                    public void onIceCandidates(java.util.Collection<LocalCandidate> iceCandidates) {
                        if (iceCandidates == null) {
                            iceCandidateListener.onIceGatheringComplete(clientId);
                            return;
                        }

                        for (LocalCandidate candidate : iceCandidates) {
                            if (candidate == null) {
                                continue;
                            }
                            IceMediaStream stream = candidate.getParentComponent().getParentStream();
                            String mid = resolveMidForStream(stream);
                            int mLineIndex = resolveMLineIndexForStream(stream);
                            iceCandidateListener.onLocalCandidate(clientId, candidate.toString(), mid, mLineIndex);
                        }
                    }
                });
            } catch (IllegalStateException e) {
                logger.atWarning().log("ICE trickle not enabled for client " + clientId + ": " + e.getMessage());
            }
        }

        private boolean hasMediaLine(String sdp, String mediaPrefix) {
            if (sdp == null || sdp.isEmpty()) {
                return false;
            }
            String[] lines = sdp.split("\r\n");
            for (String line : lines) {
                if (line.startsWith(mediaPrefix)) {
                    return true;
                }
            }
            return false;
        }

        private Component createComponentWithFallback(IceMediaStream stream, String label, int preferredPortOffset) {
            if (stream == null) {
                return null;
            }
            try {
                int minPort = NetworkConfig.getIcePortMin();
                int maxPort = NetworkConfig.getIcePortMax();
                if (minPort > 0 && maxPort > 0) {
                    int preferredPort = Math.min(maxPort, minPort + Math.max(preferredPortOffset, 0));
                    return iceAgent.createComponent(stream, preferredPort, minPort, maxPort);
                }
            } catch (Exception e) {
                logger.atWarning().log("Failed to create " + label + " component with configured ICE range: " + e.getMessage());
            }

            try {
                return iceAgent.createComponent(stream, 0, 0, 0);
            } catch (Exception e) {
                logger.atSevere().log("Failed to create " + label + " component with dynamic ports: " + e.getMessage());
                return null;
            }
        }
        
        /**
         * Wait for an Ice4j component to be created (up to maxWaitMs).
         * Components are created asynchronously during candidate gathering.
         */
        private Component waitForComponent(IceMediaStream stream, int componentId, long maxWaitMs) {
            long startTime = System.currentTimeMillis();
            long checkInterval = 50; // Check every 50ms
            int checkCount = 0;
            
            while (System.currentTimeMillis() - startTime < maxWaitMs) {
                Component component = stream.getComponent(componentId);
                if (component != null) {
                    checkCount++;
                    logger.atInfo().log("Component " + componentId + " available (after " + checkCount + " polls, " + 
                        (System.currentTimeMillis() - startTime) + "ms) for stream " + stream.getName());
                    return component;
                }
                
                try {
                    Thread.sleep(checkInterval);
                    checkCount++;
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
            
            // Final check with detailed diagnostics
            int finalCount = 0;
            for (int i = 1; i <= 5; i++) {
                if (stream.getComponent(i) != null) {
                    finalCount++;
                }
            }
            
            logger.atWarning().log("Component " + componentId + " not available after " + maxWaitMs + 
                "ms (checked " + checkCount + " times, found " + finalCount + " total components in stream " + stream.getName() + ")");
            return null;
        }
        
        /**
         * Generate SDP answer with real ICE credentials from the Ice4j Agent.
         * Mirrors m-lines from offer, populates answer with agent's ice-ufrag/pwd and candidates.
         */
        private String createAnswerSdp(String offerSdp) {
            StringBuilder answer = new StringBuilder();
            answer.append("v=0\r\n");
            answer.append("o=- 0 0 IN IP4 0.0.0.0\r\n");
            answer.append("s=Hytale Voice Chat\r\n");
            answer.append("t=0 0\r\n");
            answer.append("a=ice-options:trickle\r\n");

            String[] lines = offerSdp.split("\r\n");
            StringBuilder bundleLineBuilder = new StringBuilder();
            bundleLineBuilder.append("a=group:BUNDLE");

            boolean hasAudio = hasAudioMLine;
            boolean hasDataChannel = hasApplicationMLine;
            String audioMid = null;
            String datachannelMid = null;
            String audioDirection = "sendrecv";
            String datachannelDirection = "sendrecv";

            boolean inAudioSection = false;
            boolean inDataChannelSection = false;
            int currentMLineIndex = -1;
            for (String line : lines) {
                if (line.startsWith("m=")) {
                    currentMLineIndex++;
                    inAudioSection = line.startsWith("m=audio");
                    inDataChannelSection = line.startsWith("m=application");

                    if (inAudioSection && audioMLineIndex < 0) {
                        audioMLineIndex = currentMLineIndex;
                    }
                    if (inDataChannelSection && dataMLineIndex < 0) {
                        dataMLineIndex = currentMLineIndex;
                    }
                }

                if (line.startsWith("a=mid:")) {
                    String mid = line.substring("a=mid:".length()).trim();
                    if (inAudioSection && audioMid == null) {
                        audioMid = mid;
                    } else if (inDataChannelSection && datachannelMid == null) {
                        datachannelMid = mid;
                    }
                }

                if (inAudioSection && (line.equals("a=sendrecv") || line.equals("a=sendonly") ||
                    line.equals("a=recvonly") || line.equals("a=inactive"))) {
                    audioDirection = line.substring("a=".length());
                }
                if (inDataChannelSection && (line.equals("a=sendrecv") || line.equals("a=sendonly") ||
                    line.equals("a=recvonly") || line.equals("a=inactive"))) {
                    datachannelDirection = line.substring("a=".length());
                }
            }

            this.audioMid = audioMid;
            this.datachannelMid = datachannelMid;

            String answerAudioDirection = invertDirection(audioDirection);
            String answerDataChannelDirection = invertDirection(datachannelDirection);

            if (!hasDataChannel) {
                throw new IllegalStateException("Cannot create SDP answer without application m-line");
            }

            if (hasAudio) {
                bundleLineBuilder.append(" ").append(audioMid != null ? audioMid : "0");
            }
            if (hasDataChannel) {
                bundleLineBuilder.append(" ").append(datachannelMid != null ? datachannelMid : "1");
            }
            answer.append(bundleLineBuilder).append("\r\n");

            // Get real ICE credentials from Agent
            String iceUfrag = iceAgent.getLocalUfrag();
            String icePwd = iceAgent.getLocalPassword();
            
            logger.atInfo().log("Generated SDP answer with real ICE credentials for client " + clientId);

            if (hasAudio) {
                answer.append("m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n");
                answer.append("c=IN IP4 0.0.0.0\r\n");
                answer.append("a=rtcp:9 IN IP4 0.0.0.0\r\n");
                answer.append("a=ice-ufrag:").append(iceUfrag).append("\r\n");
                answer.append("a=ice-pwd:").append(icePwd).append("\r\n");
                answer.append("a=fingerprint:sha-256 ").append(dtlsFingerprint).append("\r\n");
                answer.append("a=setup:passive\r\n");
                answer.append("a=mid:").append(audioMid != null ? audioMid : "0").append("\r\n");
                answer.append("a=").append(answerAudioDirection).append("\r\n");
                answer.append("a=rtcp-mux\r\n");
                answer.append("a=rtpmap:111 opus/48000/2\r\n");
            }

            if (hasDataChannel) {
                answer.append("m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n");
                answer.append("c=IN IP4 0.0.0.0\r\n");
                answer.append("a=ice-ufrag:").append(iceUfrag).append("\r\n");
                answer.append("a=ice-pwd:").append(icePwd).append("\r\n");
                answer.append("a=fingerprint:sha-256 ").append(dtlsFingerprint).append("\r\n");
                answer.append("a=setup:passive\r\n");
                answer.append("a=mid:").append(datachannelMid != null ? datachannelMid : "1").append("\r\n");
                answer.append("a=").append(answerDataChannelDirection).append("\r\n");
                answer.append("a=sctp-port:5000\r\n");
                answer.append("a=max-message-size:1073741823\r\n");
            }

            return answer.toString();
        }

        private void addRemoteCandidatesFromOffer(String offerSdp) {
            if (offerSdp == null || offerSdp.isEmpty()) {
                return;
            }

            String[] lines = offerSdp.split("\r\n");
            int currentMLineIndex = -1;
            String currentMid = null;
            boolean sawEndOfCandidates = false;

            for (String line : lines) {
                if (line.startsWith("m=")) {
                    currentMLineIndex++;
                    currentMid = null;
                    continue;
                }

                if (line.startsWith("a=mid:")) {
                    currentMid = line.substring("a=mid:".length()).trim();
                    continue;
                }

                if (line.startsWith("a=candidate:") || line.startsWith("candidate:")) {
                    addRemoteCandidate(line, currentMid, currentMLineIndex);
                    continue;
                }

                if (line.startsWith("a=end-of-candidates")) {
                    sawEndOfCandidates = true;
                }
            }

            if (sawEndOfCandidates) {
                handleRemoteCandidatesComplete();
            }
        }

        private void applyRemoteIceCredentials(String offerSdp) {
            String[] lines = offerSdp.split("\r\n");
            String currentSection = null;

            String audioUfrag = null;
            String audioPwd = null;
            String dataUfrag = null;
            String dataPwd = null;
            String sessionUfrag = null;
            String sessionPwd = null;

            for (String line : lines) {
                if (line.startsWith("m=audio")) {
                    currentSection = "audio";
                } else if (line.startsWith("m=application")) {
                    currentSection = "application";
                } else if (line.startsWith("m=")) {
                    currentSection = "other";
                }

                if (line.startsWith("a=ice-ufrag:")) {
                    String ufrag = line.substring("a=ice-ufrag:".length()).trim();
                    if ("audio".equals(currentSection)) {
                        audioUfrag = ufrag;
                    } else if ("application".equals(currentSection)) {
                        dataUfrag = ufrag;
                    } else if (currentSection == null) {
                        sessionUfrag = ufrag;
                    }
                }

                if (line.startsWith("a=ice-pwd:")) {
                    String pwd = line.substring("a=ice-pwd:".length()).trim();
                    if ("audio".equals(currentSection)) {
                        audioPwd = pwd;
                    } else if ("application".equals(currentSection)) {
                        dataPwd = pwd;
                    } else if (currentSection == null) {
                        sessionPwd = pwd;
                    }
                }
            }

            if (audioUfrag == null) {
                audioUfrag = sessionUfrag;
            }
            if (audioPwd == null) {
                audioPwd = sessionPwd;
            }
            if (dataUfrag == null) {
                dataUfrag = sessionUfrag;
            }
            if (dataPwd == null) {
                dataPwd = sessionPwd;
            }

            if (audioStream != null && audioUfrag != null) {
                audioStream.setRemoteUfrag(audioUfrag);
            }
            if (audioStream != null && audioPwd != null) {
                audioStream.setRemotePassword(audioPwd);
            }

            if (datachannelStream != null && dataUfrag != null) {
                datachannelStream.setRemoteUfrag(dataUfrag);
            }
            if (datachannelStream != null && dataPwd != null) {
                datachannelStream.setRemotePassword(dataPwd);
            }
        }

        private IceMediaStream resolveStreamForCandidate(String sdpMid, int sdpMLineIndex) {
            if (sdpMid != null) {
                if (datachannelMid != null && sdpMid.equals(datachannelMid)) {
                    return datachannelStream;
                }
                if (audioMid != null && sdpMid.equals(audioMid)) {
                    return audioStream;
                }
            }

            if (sdpMLineIndex >= 0) {
                if (sdpMLineIndex == dataMLineIndex) {
                    return datachannelStream;
                }
                if (sdpMLineIndex == audioMLineIndex) {
                    return audioStream;
                }
            }

            if (datachannelStream != null) {
                return datachannelStream;
            }
            return audioStream;
        }

        private String resolveMidForStream(IceMediaStream stream) {
            if (stream == null) {
                return null;
            }
            if (stream.equals(datachannelStream)) {
                return datachannelMid;
            }
            if (audioStream != null && stream.equals(audioStream)) {
                return audioMid;
            }
            return null;
        }

        private int resolveMLineIndexForStream(IceMediaStream stream) {
            if (stream == null) {
                return -1;
            }
            if (stream.equals(datachannelStream)) {
                return dataMLineIndex;
            }
            if (audioStream != null && stream.equals(audioStream)) {
                return audioMLineIndex;
            }
            return -1;
        }

        private org.ice4j.ice.CandidateType mapCandidateType(String type) {
            if (type == null) {
                return org.ice4j.ice.CandidateType.HOST_CANDIDATE;
            }
            switch (type) {
                case "host":
                    return org.ice4j.ice.CandidateType.HOST_CANDIDATE;
                case "srflx":
                    return org.ice4j.ice.CandidateType.SERVER_REFLEXIVE_CANDIDATE;
                case "relay":
                    return org.ice4j.ice.CandidateType.RELAYED_CANDIDATE;
                case "prflx":
                    return org.ice4j.ice.CandidateType.PEER_REFLEXIVE_CANDIDATE;
                default:
                    return org.ice4j.ice.CandidateType.HOST_CANDIDATE;
            }
        }
        
        /**
         * Invert SDP media direction for answer (offer direction → answer direction).
         */
        private String invertDirection(String direction) {
            switch (direction) {
                case "sendonly":
                    return "recvonly";
                case "recvonly":
                    return "sendonly";
                case "sendrecv":
                    return "sendrecv";
                case "inactive":
                    return "inactive";
                default:
                    return "sendrecv";
            }
        }
        
        /**
         * Generate a self-signed DTLS certificate for this peer session.
         */
        private X509Certificate generateSelfSignedCertificate() 
                throws NoSuchAlgorithmException, NoSuchProviderException, OperatorCreationException, 
                       java.security.cert.CertificateException {
            // Generate RSA key pair
            KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA", "BC");
            keyGen.initialize(2048);
            KeyPair keyPair = keyGen.generateKeyPair();
            this.dtlsPrivateKey = keyPair.getPrivate();
            
            // Generate self-signed certificate
            X500Name issuer = new X500Name("CN=hytale-voice-server");
            long now = System.currentTimeMillis();
            Date notBefore = new Date(now);
            Date notAfter = new Date(Date.from(Instant.now().plus(365, ChronoUnit.DAYS)).getTime());
            BigInteger serialNumber = BigInteger.valueOf(now);
            
            JcaX509v3CertificateBuilder builder = new JcaX509v3CertificateBuilder(
                    issuer, serialNumber, notBefore, notAfter, issuer, keyPair.getPublic()
            );
            
            ContentSigner signer = new JcaContentSignerBuilder("SHA256WithRSAEncryption")
                    .setProvider("BC")
                    .build(keyPair.getPrivate());
            
            return new JcaX509CertificateConverter()
                    .setProvider("BC")
                    .getCertificate(builder.build(signer));
        }
        
        /**
         * Generate SHA-256 fingerprint of DTLS certificate for SDP.
         * Format: "AA:BB:CC:DD:..." (hex pairs separated by colons)
         */
        private String generateDtlsFingerprint(X509Certificate certificate) 
                throws CertificateEncodingException, NoSuchAlgorithmException {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] der = certificate.getEncoded();
            byte[] hash = md.digest(der);
            
            // Convert to hex string with colons
            StringBuilder fingerprint = new StringBuilder();
            for (int i = 0; i < hash.length; i++) {
                if (i > 0) {
                    fingerprint.append(":");
                }
                fingerprint.append(String.format("%02X", hash[i]));
            }
            
            return fingerprint.toString();
        }
    }
}
