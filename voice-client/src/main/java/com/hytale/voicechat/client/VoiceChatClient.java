package com.hytale.voicechat.client;

import com.hytale.voicechat.client.audio.MicrophoneManager;
import com.hytale.voicechat.client.audio.SpeakerManager;
import com.hytale.voicechat.client.gui.VoiceChatGUI;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.common.packet.AuthenticationPacket;
import javafx.application.Application;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
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
    private String username;
    private DatagramSocket socket;
    private volatile boolean connected;

    public VoiceChatClient() {
        this.clientId = UUID.randomUUID();
        this.microphoneManager = new MicrophoneManager();
        this.speakerManager = new SpeakerManager();
        this.serverAddress = "localhost";
        this.serverPort = NetworkConfig.DEFAULT_VOICE_PORT;
        this.username = System.getProperty("user.name"); // Default to system username
        this.connected = false;
    }
    
    public void setUsername(String username) {
        this.username = username;
    }
    
    public String getUsername() {
        return username;
    }

    public void connect(String serverAddress, int serverPort) {
        if (connected) {
            logger.warn("Already connected to voice server");
            return;
        }

        this.serverAddress = serverAddress;
        this.serverPort = serverPort;

        logger.info("Connecting to voice server at {}:{} as user '{}'", serverAddress, serverPort, username);
        
        try {
            // Create UDP socket
            socket = new DatagramSocket();
            
            // Send authentication packet
            sendAuthentication();
            
            // Start audio managers
            microphoneManager.start();
            speakerManager.start();
            
            connected = true;
            logger.info("Connected to voice server successfully");
        } catch (Exception e) {
            logger.error("Failed to connect to voice server", e);
            disconnect();
        }
    }
    
    private void sendAuthentication() throws IOException {
        AuthenticationPacket authPacket = new AuthenticationPacket(clientId, username);
        byte[] data = authPacket.serialize();
        
        InetAddress address = InetAddress.getByName(serverAddress);
        DatagramPacket packet = new DatagramPacket(data, data.length, address, serverPort);
        socket.send(packet);
        
        logger.info("Sent authentication packet for user '{}'", username);
    }

    public void disconnect() {
        if (!connected) {
            return;
        }

        logger.info("Disconnecting from voice server");
        microphoneManager.stop();
        speakerManager.stop();
        
        if (socket != null && !socket.isClosed()) {
            socket.close();
        }
        
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
