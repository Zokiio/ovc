package com.hytale.voicechat.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Simple test to verify connection validation
 */
public class ConnectionTest {
    private static final Logger logger = LoggerFactory.getLogger(ConnectionTest.class);
    
    public static void main(String[] args) {
        logger.info("Testing connection without server running...");
        
        VoiceChatClient client = new VoiceChatClient();
        client.setUsername("test_user");
        
        // Try to connect to localhost (no server running)
        long startTime = System.currentTimeMillis();
        client.connect("localhost", 24454);
        long endTime = System.currentTimeMillis();
        
        if (client.isConnected()) {
            logger.error("ERROR: Client claims to be connected but server is not running!");
        } else {
            logger.info("SUCCESS: Connection properly rejected after {}ms", (endTime - startTime));
        }
    }
}
