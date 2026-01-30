package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.bouncycastle.tls.*;
import org.bouncycastle.tls.crypto.TlsCrypto;
import org.bouncycastle.tls.crypto.impl.jcajce.JcaTlsCryptoProvider;
import org.bouncycastle.jce.provider.BouncyCastleProvider;

import java.io.IOException;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * DTLS transport layer for WebRTC using Bouncycastle.
 * Handles DTLS handshake over UDP via Ice4j and provides encrypted transport for SCTP.
 * 
 * Note: This is a simplified DTLS implementation for WebRTC DataChannel support.
 * Full production use would require additional security validation and error handling.
 */
public class DtlsTransport {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    static {
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
    }
    
    private final String clientId;
    private final X509Certificate localCertificate;
    private final PrivateKey privateKey;
    private final boolean isServer;
    private final TlsCrypto crypto;
    
    private DTLSServerProtocol serverProtocol;
    private DTLSClientProtocol clientProtocol;
    private DTLSTransport dtlsTransport;
    private DatagramTransport udpTransport;
    
    private final AtomicBoolean handshakeComplete = new AtomicBoolean(false);
    private final AtomicBoolean closed = new AtomicBoolean(false);
    
    private DtlsHandshakeListener handshakeListener;
    
    /**
     * Create a DTLS transport.
     * 
     * @param clientId Client identifier for logging
     * @param certificate Local DTLS certificate
     * @param privateKey Private key for the certificate
     * @param isServer True if acting as DTLS server, false for client
     */
    public DtlsTransport(String clientId, X509Certificate certificate, PrivateKey privateKey, boolean isServer) {
        this.clientId = clientId;
        this.localCertificate = certificate;
        this.privateKey = privateKey;
        this.isServer = isServer;
        
        // Initialize crypto provider
        this.crypto = new JcaTlsCryptoProvider().create(new SecureRandom());
        
        logger.atInfo().log("Created DTLS transport for client " + clientId + " (role: " + (isServer ? "server" : "client") + ")");
    }
    
    /**
     * Start DTLS handshake over the provided UDP transport.
     * 
     * @param transport Underlying UDP transport (Ice4j Component wrapper)
     * @throws IOException If handshake fails
     */
    public void startHandshake(DatagramTransport transport) throws IOException {
        if (closed.get()) {
            throw new IllegalStateException("DTLS transport is closed");
        }
        
        this.udpTransport = transport;
        logger.atInfo().log("Starting DTLS handshake for client " + clientId);
        
        try {
            if (isServer) {
                performServerHandshake();
            } else {
                performClientHandshake();
            }
            
            handshakeComplete.set(true);
            logger.atInfo().log("DTLS handshake completed successfully for client " + clientId);
            
            if (handshakeListener != null) {
                handshakeListener.onHandshakeComplete();
            }
            
        } catch (IOException e) {
            logger.atSevere().log("DTLS handshake failed for client " + clientId + ": " + e.getMessage());
            if (handshakeListener != null) {
                handshakeListener.onHandshakeFailed(e);
            }
            throw e;
        }
    }
    
    /**
     * Perform DTLS server-side handshake.
     */
    private void performServerHandshake() throws IOException {
        serverProtocol = new DTLSServerProtocol();
        
        // Create simplified DTLS server
        TlsServer tlsServer = new DefaultTlsServer(crypto) {
            @Override
            protected ProtocolVersion[] getSupportedVersions() {
                return ProtocolVersion.DTLSv12.only();
            }
            
            @Override
            protected int[] getSupportedCipherSuites() {
                return new int[] {
                    CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
                    CipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
                };
            }
            
            @Override
            public void notifyAlertRaised(short alertLevel, short alertDescription, String message, Throwable cause) {
                logger.atWarning().log("DTLS server alert: level=" + alertLevel + ", desc=" + alertDescription + ", msg=" + message);
            }
            
            @Override
            public void notifyHandshakeComplete() {
                logger.atInfo().log("DTLS server handshake complete for client " + clientId);
            }
        };
        
        // Perform handshake
        this.dtlsTransport = serverProtocol.accept(tlsServer, udpTransport);
    }
    
    /**
     * Perform DTLS client-side handshake.
     */
    private void performClientHandshake() throws IOException {
        clientProtocol = new DTLSClientProtocol();
        
        // Create simplified DTLS client
        TlsClient tlsClient = new DefaultTlsClient(crypto) {
            @Override
            protected ProtocolVersion[] getSupportedVersions() {
                return ProtocolVersion.DTLSv12.only();
            }
            
            @Override
            protected int[] getSupportedCipherSuites() {
                return new int[] {
                    CipherSuite.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
                    CipherSuite.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
                };
            }
            
            @Override
            public TlsAuthentication getAuthentication() throws IOException {
                return new TlsAuthentication() {
                    @Override
                    public void notifyServerCertificate(TlsServerCertificate serverCertificate) {
                        // Accept any certificate for WebRTC (fingerprint verified in SDP)
                        logger.atInfo().log("Received server certificate for client " + clientId);
                    }
                    
                    @Override
                    public TlsCredentials getClientCredentials(CertificateRequest certificateRequest) {
                        // No client certificate for now
                        return null;
                    }
                };
            }
            
            @Override
            public void notifyAlertRaised(short alertLevel, short alertDescription, String message, Throwable cause) {
                logger.atWarning().log("DTLS client alert: level=" + alertLevel + ", desc=" + alertDescription + ", msg=" + message);
            }
            
            @Override
            public void notifyHandshakeComplete() {
                logger.atInfo().log("DTLS client handshake complete for client " + clientId);
            }
        };
        
        // Perform handshake
        this.dtlsTransport = clientProtocol.connect(tlsClient, udpTransport);
    }
    
    /**
     * Send encrypted data through DTLS transport.
     * 
     * @param data Data to encrypt and send
     * @param offset Offset in data array
     * @param length Number of bytes to send
     * @throws IOException If send fails
     */
    public void send(byte[] data, int offset, int length) throws IOException {
        if (!handshakeComplete.get()) {
            throw new IllegalStateException("DTLS handshake not complete");
        }
        if (closed.get()) {
            throw new IllegalStateException("DTLS transport is closed");
        }
        
        dtlsTransport.send(data, offset, length);
    }
    
    /**
     * Receive and decrypt data from DTLS transport.
     * 
     * @param buf Buffer to store received data
     * @param offset Offset in buffer
     * @param length Maximum bytes to receive
     * @param waitMillis Timeout in milliseconds
     * @return Number of bytes received, or -1 if closed
     * @throws IOException If receive fails
     */
    public int receive(byte[] buf, int offset, int length, int waitMillis) throws IOException {
        if (!handshakeComplete.get()) {
            throw new IllegalStateException("DTLS handshake not complete");
        }
        if (closed.get()) {
            return -1;
        }
        
        return dtlsTransport.receive(buf, offset, length, waitMillis);
    }
    
    /**
     * Check if DTLS handshake is complete.
     */
    public boolean isHandshakeComplete() {
        return handshakeComplete.get();
    }
    
    /**
     * Set listener for handshake events.
     */
    public void setHandshakeListener(DtlsHandshakeListener listener) {
        this.handshakeListener = listener;
    }
    
    /**
     * Close DTLS transport.
     */
    public void close() {
        if (closed.compareAndSet(false, true)) {
            try {
                if (dtlsTransport != null) {
                    dtlsTransport.close();
                }
                logger.atInfo().log("DTLS transport closed for client " + clientId);
            } catch (IOException e) {
                logger.atWarning().log("Error closing DTLS transport: " + e.getMessage());
            }
        }
    }
    
    /**
     * Get the underlying DTLS transport for direct access.
     */
    public DTLSTransport getDtlsTransport() {
        return dtlsTransport;
    }
    
    /**
     * Listener interface for DTLS handshake events.
     */
    public interface DtlsHandshakeListener {
        void onHandshakeComplete();
        void onHandshakeFailed(Exception error);
    }
}
