package com.hytale.voicechat.client;

import com.hytale.voicechat.client.audio.MicrophoneManager;
import com.hytale.voicechat.client.audio.SpeakerManager;
import com.hytale.voicechat.client.gui.VoiceChatGUI;
import com.hytale.voicechat.common.network.NetworkConfig;
import javafx.application.Application;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.UUID;

/**
 * Main voice chat client application
 */
public class VoiceChatClient {
    private static final Logger logger = LoggerFactory.getLogger(VoiceChatClient.class);
    
    private final UUID clientId;
    private final MicrophoneManager microphoneManager;
    private final SpeakerManager speakerManager;
    private String serverAddress;
    private int serverPort;
    private volatile boolean connected;

    public VoiceChatClient() {
        this.clientId = UUID.randomUUID();
        this.microphoneManager = new MicrophoneManager();
        this.speakerManager = new SpeakerManager();
        this.serverAddress = "localhost";
        this.serverPort = NetworkConfig.DEFAULT_VOICE_PORT;
        this.connected = false;
    }

    public void connect(String serverAddress, int serverPort) {
        if (connected) {
            logger.warn("Already connected to voice server");
            return;
        }

        this.serverAddress = serverAddress;
        this.serverPort = serverPort;

        logger.info("Connecting to voice server at {}:{}", serverAddress, serverPort);
        
        try {
            microphoneManager.start();
            speakerManager.start();
            connected = true;
            logger.info("Connected to voice server successfully");
        } catch (Exception e) {
            logger.error("Failed to connect to voice server", e);
            disconnect();
        }
    }

    public void disconnect() {
        if (!connected) {
            return;
        }

        logger.info("Disconnecting from voice server");
        microphoneManager.stop();
        speakerManager.stop();
        connected = false;
    }

    public UUID getClientId() {
        return clientId;
    }

    public boolean isConnected() {
        return connected;
    }

    public static void main(String[] args) {
        logger.info("Starting Hytale Voice Chat Client");
        Application.launch(VoiceChatGUI.class, args);
    }
}
