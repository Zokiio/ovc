package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.bouncycastle.asn1.x500.X500Name;
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter;
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.bouncycastle.operator.ContentSigner;
import org.bouncycastle.operator.OperatorCreationException;
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder;
import org.ice4j.TransportAddress;
import org.ice4j.ice.Agent;
import org.ice4j.ice.IceMediaStream;
import org.ice4j.ice.harvest.StunCandidateHarvester;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.NoSuchProviderException;
import java.security.cert.CertificateEncodingException;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages WebRTC peer connections (Ice4j-based, DataChannel-first).
 *
 * NOTE: This is scaffolding for the Ice4j integration layer. The SDP/ICE
 * handling will be implemented in the next phase when we wire signaling.
 */
public class WebRTCPeerManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    // Initialize BouncyCastle provider for DTLS certificate generation
    static {
        java.security.Security.addProvider(new BouncyCastleProvider());
    }

    private final Map<UUID, WebRTCPeerSession> sessions = new ConcurrentHashMap<>();
    private final List<String> stunServers;
    private final DataChannelAudioHandler audioHandler;

    public WebRTCPeerManager(List<String> stunServers, DataChannelAudioHandler audioHandler) {
        this.stunServers = stunServers;
        this.audioHandler = audioHandler;
    }

    /**
     * Create a peer connection for the given client and return the SDP answer.
     *
     * @param clientId The web client UUID.
     * @param offerSdp The SDP offer from the browser.
     * @return SDP answer to send back to the client.
     */
    public String createPeerConnection(UUID clientId, String offerSdp) {
        WebRTCPeerSession session = new WebRTCPeerSession(clientId, offerSdp);
        sessions.put(clientId, session);
        logger.atWarning().log("Created WebRTC peer session with provisional SDP answer (Ice4j wiring pending): " + clientId);
        return session.getAnswerSdp();
    }

    /**
     * Handle a trickled ICE candidate from the client.
     */
    public void handleIceCandidate(UUID clientId, String candidate, String sdpMid, int sdpMLineIndex) {
        WebRTCPeerSession session = sessions.get(clientId);
        if (session == null) {
            logger.atWarning().log("Received ICE candidate for unknown client: " + clientId);
            return;
        }
        session.addRemoteCandidate(candidate, sdpMid, sdpMLineIndex);
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
        private final X509Certificate dtlsCertificate;
        private final String dtlsFingerprint;

        WebRTCPeerSession(UUID clientId, String offerSdp) {
            this.clientId = clientId;
            this.offerSdp = offerSdp;
            
            try {
                // Create Ice4j Agent with controlling role (server controls candidate nomination)
                this.iceAgent = new Agent();
                this.iceAgent.setControlling(true);
                
                logger.atInfo().log("Created Ice4j Agent with controlling role for client " + clientId);
                
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
                
                // Create media streams for audio and datachannel
                this.audioStream = iceAgent.createMediaStream("audio");
                this.datachannelStream = iceAgent.createMediaStream("application");
                
                logger.atInfo().log("Created Ice4j media streams for audio and datachannel: " + clientId);
                
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
                
                // Generate SDP answer with real ICE credentials
                this.answerSdp = this.createAnswerSdp(offerSdp);
                
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
                // Parse candidate string format per WebRTC spec:
                // candidate:<foundation> <component> <transport> <priority> <ip> <port> typ <type> [raddr <rel-ip>] [rport <rel-port>]
                // Example: candidate:0 1 udp 2122260223 192.168.1.1 54321 typ host
                
                IceMediaStream stream = "audio".equals(sdpMid) ? audioStream : datachannelStream;
                if (stream == null) {
                    logger.atWarning().log("Received ICE candidate for unknown media stream: " + sdpMid + " for client " + clientId);
                    return;
                }
                
                // For SFU mode, we primarily need to gather our own server-side candidates
                // Browser (client) candidates will be used during full connectivity checks
                // For now: log the candidate and defer full Agent integration
                
                if (candidate.startsWith("candidate:")) {
                    String candidateLine = candidate.substring("candidate:".length());
                    logger.atInfo().log("Received remote ICE candidate for " + sdpMid + " (component=" + sdpMLineIndex + "): " + candidateLine);
                    
                    // TODO: Parse candidate parts and add to Agent via agent.addRemoteCandidate()
                    // This requires:
                    // 1. Split the candidate line by spaces
                    // 2. Extract foundation, component, transport, priority, ip, port, type
                    // 3. Create ice4j.ice.Candidate object
                    // 4. Call agent.addRemoteCandidate(stream, component, candidate)
                    // Deferred to next phase when full ICE connectivity is needed
                } else {
                    logger.atWarning().log("Invalid ICE candidate format: " + candidate);
                }
                
            } catch (Exception e) {
                logger.atWarning().log("Failed to process ICE candidate: " + e.getMessage());
            }
        }

        void close() {
            try {
                if (iceAgent != null) {
                    iceAgent.free();
                    logger.atInfo().log("Freed Ice4j Agent resources for client " + clientId);
                }
            } catch (Exception e) {
                logger.atWarning().log("Error closing Ice4j Agent: " + e.getMessage());
            }
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

            String[] lines = offerSdp.split("\r\n");
            StringBuilder bundleLineBuilder = new StringBuilder();
            bundleLineBuilder.append("a=group:BUNDLE");

            boolean hasAudio = false;
            boolean hasDataChannel = false;
            String audioMid = null;
            String datachannelMid = null;
            String audioDirection = "sendrecv";
            String datachannelDirection = "sendrecv";

            for (String line : lines) {
                if (line.startsWith("m=audio")) {
                    hasAudio = true;
                } else if (line.startsWith("m=application")) {
                    hasDataChannel = true;
                }
            }

            boolean inAudioSection = false;
            boolean inDataChannelSection = false;
            for (String line : lines) {
                if (line.startsWith("m=audio")) {
                    inAudioSection = true;
                    inDataChannelSection = false;
                } else if (line.startsWith("m=application")) {
                    inAudioSection = false;
                    inDataChannelSection = true;
                } else if (line.startsWith("m=")) {
                    inAudioSection = false;
                    inDataChannelSection = false;
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

            String answerAudioDirection = invertDirection(audioDirection);
            String answerDataChannelDirection = invertDirection(datachannelDirection);

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
                answer.append("a=setup:active\r\n");
                answer.append("a=mid:").append(audioMid != null ? audioMid : "0").append("\r\n");
                answer.append("a=").append(answerAudioDirection).append("\r\n");
                answer.append("a=rtcp-mux\r\n");
                answer.append("a=rtpmap:111 opus/48000/2\r\n");
                
                // Add candidates from audio stream (will be populated after gathering completes)
                // For now: placeholder, will be populated in next phase when candidate trickle is implemented
                answer.append("a=end-of-candidates\r\n");
            }

            if (hasDataChannel) {
                answer.append("m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n");
                answer.append("c=IN IP4 0.0.0.0\r\n");
                answer.append("a=ice-ufrag:").append(iceUfrag).append("\r\n");
                answer.append("a=ice-pwd:").append(icePwd).append("\r\n");
                answer.append("a=fingerprint:sha-256 ").append(dtlsFingerprint).append("\r\n");
                answer.append("a=setup:active\r\n");
                answer.append("a=mid:").append(datachannelMid != null ? datachannelMid : "1").append("\r\n");
                answer.append("a=").append(answerDataChannelDirection).append("\r\n");
                answer.append("a=sctp-port:5000\r\n");
                answer.append("a=max-message-size:1073741823\r\n");
                
                // Add candidates from datachannel stream (will be populated after gathering completes)
                // For now: placeholder, will be populated in next phase when candidate trickle is implemented
                answer.append("a=end-of-candidates\r\n");
            }

            return answer.toString();
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
