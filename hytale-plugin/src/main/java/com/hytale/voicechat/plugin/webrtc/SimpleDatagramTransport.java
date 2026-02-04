package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.bouncycastle.tls.DatagramTransport;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.SocketTimeoutException;

/**
 * Fallback datagram transport for DTLS when Ice4j components unavailable.
 * Used in SFU (localhost/testing) scenarios where we skip full ICE negotiation.
 * 
 * Creates a simple UDP socket on localhost for DTLS handshake.
 */
public class SimpleDatagramTransport implements DatagramTransport {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final DatagramSocket socket;
    private final InetAddress localAddress;
    private final int localPort;
    private InetAddress remoteAddress;
    private int remotePort;
    private final int receiveLimit;
    private final int sendLimit;
    
    /**
     * Create a simple UDP transport for DTLS (SFU/localhost mode).
     * Server listens on 0.0.0.0:0 (any available port on any interface).
     */
    public SimpleDatagramTransport() throws IOException {
        // Create socket on all interfaces, any available port
        // This allows clients to connect from any address (localhost, remote, etc.)
        this.socket = new DatagramSocket(0, InetAddress.getByName("0.0.0.0"));
        this.localAddress = socket.getLocalAddress();
        this.localPort = socket.getLocalPort();
        
        // Remote address will be set when first packet arrives from client
        this.remoteAddress = null;
        this.remotePort = 0;
        
        // Receive timeout for async operations
        this.socket.setSoTimeout(500);
        
        // WebRTC DTLS packet size limits
        this.receiveLimit = 2048;
        this.sendLimit = 1200;
        
        logger.atInfo().log("Created simple UDP transport for DTLS on 0.0.0.0:" + localPort + " (listening on all interfaces)");
    }
    
    @Override
    public int getReceiveLimit() throws IOException {
        return receiveLimit;
    }
    
    @Override
    public int getSendLimit() throws IOException {
        return sendLimit;
    }
    
    @Override
    public int receive(byte[] buf, int off, int len, int waitMillis) throws IOException {
        try {
            // Set receive timeout for this operation
            socket.setSoTimeout(waitMillis > 0 ? waitMillis : 500);
            DatagramPacket packet = new DatagramPacket(buf, off, len);
            socket.receive(packet);
            
            // Capture remote address from first packet
            if (remoteAddress == null) {
                remoteAddress = packet.getAddress();
                remotePort = packet.getPort();
                logger.atInfo().log("DTLS client identified: " + remoteAddress.getHostAddress() + ":" + remotePort);
            }
            
            return packet.getLength();
        } catch (SocketTimeoutException e) {
            return 0; // Timeout, no data received
        }
    }
    
    @Override
    public void send(byte[] buf, int off, int len) throws IOException {
        if (remoteAddress == null || remotePort == 0) {
            logger.atWarning().log("Cannot send DTLS packet; remote address not yet known. Waiting for first packet from client.");
            return;
        }
        
        DatagramPacket packet = new DatagramPacket(buf, off, len, remoteAddress, remotePort);
        socket.send(packet);
    }
    
    @Override
    public void close() throws IOException {
        if (socket != null && !socket.isClosed()) {
            socket.close();
            logger.atInfo().log("Closed simple UDP transport");
        }
    }
    
    public int getLocalPort() {
        return localPort;
    }
    
    public InetAddress getLocalAddress() {
        return localAddress;
    }
}
