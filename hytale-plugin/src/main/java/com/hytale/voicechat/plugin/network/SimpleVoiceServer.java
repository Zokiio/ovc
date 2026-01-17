package com.hytale.voicechat.plugin.network;

import com.hypixel.hytale.logger.HytaleLogger;


/**
 * Simple standalone test server
 */
public class SimpleVoiceServer {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    public static void main(String[] args) throws Exception {
        logger.atInfo().log("Starting standalone voice server on port 24454");
        
        // Create UDP server without Hytale integration
        UDPSocketManager server = new UDPSocketManager(24454);
        server.start();
        
        logger.atInfo().log("Voice server started. Press Ctrl+C to stop.");
        
        // Keep running
        Thread.currentThread().join();
    }
}
