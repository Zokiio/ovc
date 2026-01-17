package com.hytale.voicechat.plugin;

import com.hypixel.hytale.logger.HytaleLogger;
import java.util.concurrent.CountDownLatch;


/**
 * Main Voice Server application
 * Handles UDP audio streaming, player management, and proximity-based voice channels
 */
public class VoiceServer {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    
    private final int port;
    
    public VoiceServer(int port) {
        this.port = port;
    }
    
    public void start() {
        logger.atInfo().log("Starting Voice Server on port " + port);
        // TODO: Initialize UDP server
        // TODO: Initialize player manager
        // TODO: Initialize voice channel manager
    }
    
    public void stop() {
        logger.atInfo().log("Stopping Voice Server");
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
        CountDownLatch shutdownLatch = new CountDownLatch(1);

        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            server.stop();
            shutdownLatch.countDown();
        }, "VoiceServer-Shutdown"));

        try {
            server.start();
            shutdownLatch.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            server.stop();
        }
    }
}
