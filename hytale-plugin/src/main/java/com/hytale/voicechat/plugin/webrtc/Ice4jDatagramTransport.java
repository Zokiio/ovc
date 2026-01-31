package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.bouncycastle.tls.DatagramTransport;
import org.ice4j.ice.Component;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.SocketTimeoutException;

/**
 * Adapter between Ice4j Component and Bouncycastle DatagramTransport.
 * Allows DTLS to send/receive packets through an established ICE connection.
 */
public class Ice4jDatagramTransport implements DatagramTransport {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final Component component;
    private final DatagramSocket socket;
    private final int receiveLimit;
    private final int sendLimit;
    
    /**
     * Create a datagram transport wrapper for an Ice4j Component.
     * 
     * @param component Ice4j component (must have selected pair)
     */
    public Ice4jDatagramTransport(Component component) {
        this.component = component;
        this.socket = component.getSocket();
        
        // WebRTC DTLS packet size limits
        this.receiveLimit = 2048; // Maximum DTLS record size
        this.sendLimit = 1200;    // Safe MTU for fragmented packets
        
        logger.atInfo().log("Created Ice4j datagram transport for component " + component.getName());
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
        if (socket == null) {
            throw new IOException("Ice4j Component socket not available");
        }
        
        try {
            // Set socket timeout for this receive operation
            int originalTimeout = socket.getSoTimeout();
            socket.setSoTimeout(waitMillis);
            
            DatagramPacket packet = new DatagramPacket(buf, off, Math.min(len, receiveLimit));
            socket.receive(packet);
            
            // Restore original timeout
            socket.setSoTimeout(originalTimeout);
            
            int received = packet.getLength();
            logger.atFine().log("Received " + received + " bytes via Ice4j Component");
            
            return received;
            
        } catch (SocketTimeoutException e) {
            // Timeout is expected for DTLS receive with waitMillis
            return 0;
        } catch (IOException e) {
            logger.atWarning().log("Error receiving from Ice4j Component: " + e.getMessage());
            throw e;
        }
    }
    
    @Override
    public void send(byte[] buf, int off, int len) throws IOException {
        if (socket == null) {
            throw new IOException("Ice4j Component socket not available");
        }
        
        if (len > sendLimit) {
            throw new IOException("Packet size " + len + " exceeds send limit " + sendLimit);
        }
        
        try {
            // Send to the remote address of the selected candidate pair
            if (component.getSelectedPair() != null) {
                var remoteCandidate = component.getSelectedPair().getRemoteCandidate();
                var remoteAddress = remoteCandidate.getTransportAddress();
                
                DatagramPacket packet = new DatagramPacket(buf, off, len, 
                    remoteAddress.getAddress(), remoteAddress.getPort());
                socket.send(packet);
                
                logger.atFine().log("Sent " + len + " bytes via Ice4j Component to " + remoteAddress);
            } else {
                // No selected pair yet - ICE not complete
                logger.atWarning().log("Cannot send: Ice4j Component has no selected pair");
                throw new IOException("ICE connection not established (no selected pair)");
            }
            
        } catch (IOException e) {
            logger.atWarning().log("Error sending via Ice4j Component: " + e.getMessage());
            throw e;
        }
    }
    
    @Override
    public void close() throws IOException {
        logger.atInfo().log("Closing Ice4j datagram transport for component " + component.getName());
        // Note: Don't close the socket here - Ice4j manages it
        // Just signal that this transport is no longer active
    }
}
