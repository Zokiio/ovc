package com.hytale.voicechat.server.network;

/**
 * Handles UDP packet reception and transmission
 */
public class UDPSocketManager {
    private final int port;
    
    public UDPSocketManager(int port) {
        this.port = port;
    }
    
    public void bind() {
        // TODO: Bind to UDP port
    }
    
    public void close() {
        // TODO: Close socket
    }
}
