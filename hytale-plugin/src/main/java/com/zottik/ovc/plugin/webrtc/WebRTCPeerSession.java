package com.zottik.ovc.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import com.typesafe.config.ConfigFactory;
import com.zottik.ovc.common.network.NetworkConfig;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
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
import org.jitsi.dcsctp4j.SendStatus;

import java.io.IOException;
import java.math.BigInteger;
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
import java.util.Date;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

class WebRTCPeerSession {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    private final List<String> stunServers;
    private final DataChannelAudioHandler audioHandler;
    private final WebRTCPeerManager.IceCandidateListener iceCandidateListener;
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
    private final PrivateKey dtlsPrivateKey;
    private final AtomicReference<Short> audioStreamId = new AtomicReference<>(null);
    private final AtomicBoolean dataChannelTransportStarting = new AtomicBoolean(false);
    private final AtomicBoolean closed = new AtomicBoolean(false);
    private DtlsTransport dtlsTransport;
    private SctpTransport sctpTransport;
    private DataChannelManager dataChannelManager;
    private final String audioMid;
    private final String datachannelMid;
    private final int audioMLineIndex;
    private final int dataMLineIndex;

    WebRTCPeerSession(UUID clientId, String offerSdp, List<String> stunServers, DataChannelAudioHandler audioHandler, WebRTCPeerManager.IceCandidateListener iceCandidateListener) {
        this.stunServers = stunServers;
        this.audioHandler = audioHandler;
        this.iceCandidateListener = iceCandidateListener;
        this.clientId = clientId;
        this.offerSdp = offerSdp;
        SdpAnswerFactory.OfferDescriptor offerDescriptor = SdpAnswerFactory.parseOffer(offerSdp);
        this.hasAudioMLine = offerDescriptor.hasAudioMLine();
        this.hasApplicationMLine = offerDescriptor.hasApplicationMLine();
        this.audioMid = offerDescriptor.audioMid();
        this.datachannelMid = offerDescriptor.datachannelMid();
        this.audioMLineIndex = offerDescriptor.audioMLineIndex();
        this.dataMLineIndex = offerDescriptor.dataMLineIndex();
        
        try {
            // Set context classloader to ensure Ice4j finds our config files
            Thread currentThread = Thread.currentThread();
            ClassLoader originalClassLoader = currentThread.getContextClassLoader();
            currentThread.setContextClassLoader(WebRTCPeerSession.class.getClassLoader());
            
            // Invalidate caches to ensure fresh config load with our classloader
            ConfigFactory.invalidateCaches();
            ConfigFactory.load(WebRTCPeerSession.class.getClassLoader());
            
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
                DtlsIdentity dtlsIdentity = generateSelfSignedIdentity();
                this.dtlsCertificate = dtlsIdentity.certificate();
                this.dtlsPrivateKey = dtlsIdentity.privateKey();
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
            this.answerSdp = SdpAnswerFactory.createAnswerSdp(iceAgent, offerDescriptor, dtlsFingerprint);
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
            IceCandidateParser.ParsedIceCandidate parsedCandidate = IceCandidateParser.parse(candidate);

            if (!"udp".equalsIgnoreCase(parsedCandidate.transport())) {
                logger.atFine().log("Skipping non-UDP ICE candidate for client " + clientId + ": " + parsedCandidate.transport());
                return;
            }

            IceMediaStream targetStream = resolveStreamForCandidate(sdpMid, sdpMLineIndex);
            if (targetStream == null) {
                logger.atWarning().log("No ICE stream available for candidate on client " + clientId);
                return;
            }

            Component component = targetStream.getComponent(parsedCandidate.componentId());
            if (component == null) {
                logger.atWarning().log("ICE component " + parsedCandidate.componentId() + " not available for stream " + targetStream.getName());
                return;
            }

            TransportAddress transportAddress = new TransportAddress(parsedCandidate.address(), parsedCandidate.port(), Transport.UDP);
            RemoteCandidate remoteCandidate = new RemoteCandidate(
                transportAddress,
                component,
                parsedCandidate.type(),
                parsedCandidate.foundation(),
                parsedCandidate.priority(),
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
        closed.set(true);
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
        if (closed.get()) {
            logger.atWarning().log("DataChannel transport requested for closed session " + clientId);
            return;
        }
        if (dtlsTransport != null || sctpTransport != null) {
            logger.atWarning().log("DataChannel transport already started for client " + clientId);
            return;
        }
        if (!dataChannelTransportStarting.compareAndSet(false, true)) {
            logger.atFine().log("DataChannel transport start already in progress for client " + clientId);
            return;
        }

        Thread startThread = new Thread(() -> {
            try {
                startDataChannelTransportInternal();
            } finally {
                dataChannelTransportStarting.set(false);
            }
        }, "datachannel-start-" + clientId);
        startThread.setDaemon(true);
        startThread.start();
    }

    private void startDataChannelTransportInternal() {
        if (closed.get()) {
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

        logger.atInfo().log("Waiting for ICE selected pair on datachannel component for client " + clientId + "...");
        if (!waitForSelectedPair(dataComponent, 10000)) {
            logger.atSevere().log("DataChannel transport unavailable: ICE selected pair not established after 10s for client " + clientId);
            return;
        }

        if (closed.get()) {
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
                                public DataChannelAudioHandler.SendResult send(byte[] audioData) {
                                    Short streamId = audioStreamId.get();
                                    if (streamId == null || dataChannelManager == null) {
                                        return DataChannelAudioHandler.SendResult.CLOSED;
                                    }

                                    SendStatus sendStatus = dataChannelManager.sendBinary(streamId, audioData);
                                    if (sendStatus == SendStatus.kSuccess) {
                                        return DataChannelAudioHandler.SendResult.SUCCESS;
                                    }
                                    if (sendStatus == SendStatus.kErrorResourceExhaustion) {
                                        return DataChannelAudioHandler.SendResult.BACKPRESSURED;
                                    }
                                    if (sendStatus == SendStatus.kErrorShuttingDown) {
                                        return DataChannelAudioHandler.SendResult.CLOSED;
                                    }
                                    return DataChannelAudioHandler.SendResult.ERROR;
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

    private boolean waitForSelectedPair(Component component, long maxWaitMs) {
        long startTime = System.currentTimeMillis();
        long checkInterval = 25;
        int checkCount = 0;

        while (System.currentTimeMillis() - startTime < maxWaitMs) {
            if (closed.get()) {
                return false;
            }
            if (component.getSelectedPair() != null) {
                logger.atInfo().log("ICE selected pair ready (after " + checkCount + " polls, " +
                    (System.currentTimeMillis() - startTime) + "ms) for client " + clientId);
                return true;
            }

            try {
                Thread.sleep(checkInterval);
                checkCount++;
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }

        logger.atWarning().log("ICE selected pair not available after " + maxWaitMs + "ms for client " + clientId +
            " (ICE state: " + iceAgent.getState() + ")");
        return false;
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

    /**
     * Generate a self-signed DTLS certificate for this peer session.
     */
    private DtlsIdentity generateSelfSignedIdentity()
            throws NoSuchAlgorithmException, NoSuchProviderException, OperatorCreationException, 
                   java.security.cert.CertificateException {
        // Generate RSA key pair
        KeyPairGenerator keyGen = KeyPairGenerator.getInstance("RSA", "BC");
        keyGen.initialize(2048);
        KeyPair keyPair = keyGen.generateKeyPair();
        PrivateKey privateKey = keyPair.getPrivate();
        
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
                .build(privateKey);

        X509Certificate certificate = new JcaX509CertificateConverter()
                .setProvider("BC")
                .getCertificate(builder.build(signer));
        return new DtlsIdentity(certificate, privateKey);
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

    private record DtlsIdentity(X509Certificate certificate, PrivateKey privateKey) {
    }
}
