package com.hytale.voicechat.server;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Main Voice Server application
 * Handles UDP audio streaming, player management, and proximity-based voice channels
 */
public class VoiceServer {
    private static final Logger logger = LoggerFactory.getLogger(VoiceServer.class);
    
    private final int port;
    
    public VoiceServer(int port) {
        this.port = port;
    }
    
    public void start() {
        logger.info("Starting Voice Server on port {}", port);
        // TODO: Initialize UDP server
        // TODO: Initialize player manager
        // TODO: Initialize voice channel manager
    }
    
    public void stop() {
        logger.info("Stopping Voice Server");
        // TODO: Cleanup resources
    }
    
    public static void main(String[] args) {
        int port = 24454; // Default voice chat port
        
        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException e) {
                System.err.println("Invalid port number: " + args[0]);
                System.exit(1);
            }
        }
        
        VoiceServer server = new VoiceServer(port);
        server.start();
        
        // Keep server running
        try {
            Thread.currentThread().join();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        server.stop();
    }
}
