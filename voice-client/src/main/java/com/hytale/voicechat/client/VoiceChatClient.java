package com.hytale.voicechat.client;

import com.hytale.voicechat.client.audio.MicrophoneManager;
import com.hytale.voicechat.client.audio.SpeakerManager;
import com.hytale.voicechat.client.gui.VoiceChatGUI;
import com.hytale.voicechat.common.network.NetworkConfig;
import com.hytale.voicechat.common.packet.AudioPacket;
import com.hytale.voicechat.common.packet.AuthenticationPacket;
import javafx.application.Application;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

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
    private InetAddress serverInetAddress;
    private volatile boolean connected;
    private Thread transmitThread;
    private Thread receiveThread;
    private final AtomicInteger sequenceNumber;

    public VoiceChatClient() {
        this.clientId = UUID.randomUUID();
        this.microphoneManager = new MicrophoneManager();
        this.speakerManager = new SpeakerManager();
        this.serverAddress = "localhost";
        this.serverPort = NetworkConfig.DEFAULT_VOICE_PORT;
        this.username = System.getProperty("user.name"); // Default to system username
        this.sequenceNumber = new AtomicInteger(0);
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
            serverInetAddress = InetAddress.getByName(serverAddress);
            
            // Send authentication packet
            sendAuthentication();
            
            // Start audio managers
            microphoneManager.start();
            speakerManager.start();
            
            // Mark as connected BEFORE starting threads (so they can loop)
            connected = true;
            
            // Start transmit thread (send microphone data)
            transmitThread = new Thread(this::transmitLoop, "Audio-Transmit");
            transmitThread.setDaemon(true);
            transmitThread.start();
            
            // Start receive thread (receive audio from others)
            receiveThread = new Thread(this::receiveLoop, "Audio-Receive");
            receiveThread.setDaemon(true);
            receiveThread.start();
            
            logger.info("Connected to voice server successfully");
        } catch (Exception e) {
            logger.error("Failed to connect to voice server", e);
            disconnect();
        }
    }
    
    private void sendAuthentication() throws IOException {
        AuthenticationPacket authPacket = new AuthenticationPacket(clientId, username);
        byte[] data = authPacket.serialize();
        
        DatagramPacket packet = new DatagramPacket(data, data.length, serverInetAddress, serverPort);
        socket.send(packet);
        
        logger.info("Sent authentication packet for user '{}'", username);
    }
    
    /**
     * Transmit audio loop - captures microphone and sends to server
     */
    private void transmitLoop() {
        logger.info("Audio transmission started");
        
        while (connected && !Thread.interrupted()) {
            try {
                // Capture audio frame from microphone (blocking with timeout)
                short[] audioSamples = microphoneManager.captureFrameBlocking();
                
                if (audioSamples != null && audioSamples.length > 0) {
                    // Convert samples to bytes (for transmission)
                    // TODO: Encode with Opus codec here
                    byte[] audioData = samplesToBytes(audioSamples);
                    
                    // Create and send audio packet
                    AudioPacket audioPacket = new AudioPacket(
                        clientId, 
                        audioData, 
                        sequenceNumber.getAndIncrement()
                    );
                    
                    byte[] packetData = audioPacket.serialize();
                    DatagramPacket udpPacket = new DatagramPacket(
                        packetData, 
                        packetData.length, 
                        serverInetAddress, 
                        serverPort
                    );
                    
                    socket.send(udpPacket);
                }
                // No sleep needed - blocking call naturally paces transmission
                
            } catch (Exception e) {
                if (connected && !Thread.interrupted()) {
                    logger.error("Error transmitting audio", e);
                } else {
                    break; // Thread interrupted, exit loop
                }
            }
        }
        
        logger.info("Audio transmission stopped");
    }
    
    /**
     * Receive audio loop - receives audio from server and plays it
     */
    private void receiveLoop() {
        logger.info("Audio reception started");
        byte[] buffer = new byte[4096];
        
        while (connected && !Thread.interrupted()) {
            try {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                socket.receive(packet);
                
                byte[] data = new byte[packet.getLength()];
                System.arraycopy(buffer, 0, data, 0, packet.getLength());
                
                // Check packet type
                if (data.length > 0 && data[0] == 0x02) { // Audio packet
                    AudioPacket audioPacket = AudioPacket.deserialize(data);
                    
                    // TODO: Decode with Opus codec here
                    // For now, convert bytes back to samples
                    short[] samples = bytesToSamples(audioPacket.getAudioData());
                    
                    // Play audio
                    speakerManager.playFrame(samples);
                }
                
            } catch (Exception e) {
                if (connected && !socket.isClosed()) {
                    logger.error("Error receiving audio", e);
                }
            }
        }
        
        logger.info("Audio reception stopped");
    }
    
    /**
     * Convert PCM samples to bytes (little-endian 16-bit)
     */
    private byte[] samplesToBytes(short[] samples) {
        byte[] bytes = new byte[samples.length * 2];
        for (int i = 0; i < samples.length; i++) {
            bytes[i * 2] = (byte) (samples[i] & 0xFF);
            bytes[i * 2 + 1] = (byte) ((samples[i] >> 8) & 0xFF);
        }
        return bytes;
    }
    
    /**
     * Convert bytes to PCM samples (little-endian 16-bit)
     */
    private short[] bytesToSamples(byte[] bytes) {
        short[] samples = new short[bytes.length / 2];
        for (int i = 0; i < samples.length; i++) {
            samples[i] = (short) ((bytes[i * 2 + 1] << 8) | (bytes[i * 2] & 0xFF));
        }
        return samples;
    }

    public void disconnect() {
        if (!connected) {
            return;
        }

        logger.info("Disconnecting from voice server");
        connected = false;
        
        // Stop threads
        if (transmitThread != null) {
            transmitThread.interrupt();
        }
        if (receiveThread != null) {
            receiveThread.interrupt();
        }
        
        // Stop audio
        microphoneManager.stop();
        speakerManager.stop();
        
        // Close socket
        if (socket != null && !socket.isClosed()) {
            socket.close();
        }
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
