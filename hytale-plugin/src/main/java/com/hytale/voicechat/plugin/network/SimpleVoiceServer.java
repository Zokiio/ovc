package com.hytale.voicechat.plugin.network;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Simple standalone test server
 */
public class SimpleVoiceServer {
    private static final Logger logger = LoggerFactory.getLogger(SimpleVoiceServer.class);
    
    public static void main(String[] args) throws Exception {
        logger.info("Starting standalone voice server on port 24454");
        
        // Create UDP server without Hytale integration
        UDPSocketManager server = new UDPSocketManager(24454);
        server.start();
        
        logger.info("Voice server started. Press Ctrl+C to stop.");
        
        // Keep running
        Thread.currentThread().join();
    }
}
