package com.hytale.voicechat.client.audio;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sound.sampled.*;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;

/**
 * Manages microphone input using Java Sound API
 * Captures 16-bit PCM audio at 48kHz mono
 */
public class MicrophoneManager {
    private static final Logger logger = LoggerFactory.getLogger(MicrophoneManager.class);
    
    // Audio format: 48kHz, 16-bit, mono
    private static final int SAMPLE_RATE = 48000;
    private static final int SAMPLE_SIZE_BITS = 16;
    private static final int CHANNELS = 1;
    private static final int FRAME_SIZE = 960; // 20ms at 48kHz
    private static final int BUFFER_SIZE = FRAME_SIZE * 2; // 2 bytes per sample
    
    private TargetDataLine microphone;
    private volatile boolean capturing;
    private Thread captureThread;
    private final BlockingQueue<short[]> audioQueue;
    
    public MicrophoneManager() {
        this.audioQueue = new LinkedBlockingQueue<>(50); // Buffer 50 frames (1 second)
        this.capturing = false;
    }
    
    public void start() {
        if (capturing) {
            logger.warn("Microphone already capturing");
            return;
        }
        
        try {
            AudioFormat format = new AudioFormat(
                SAMPLE_RATE,
                SAMPLE_SIZE_BITS,
                CHANNELS,
                true,  // signed
                false  // little-endian
            );
            
            DataLine.Info info = new DataLine.Info(TargetDataLine.class, format);
            
            if (!AudioSystem.isLineSupported(info)) {
                logger.error("Microphone line not supported");
                return;
            }
            
            microphone = (TargetDataLine) AudioSystem.getLine(info);
            microphone.open(format, BUFFER_SIZE);
            microphone.start();
            
            capturing = true;
            
            // Start capture thread
            captureThread = new Thread(this::captureLoop, "Microphone-Capture");
            captureThread.setDaemon(true);
            captureThread.start();
            
            logger.info("Microphone started: {}Hz, {}ch, {}bits", SAMPLE_RATE, CHANNELS, SAMPLE_SIZE_BITS);
            
        } catch (LineUnavailableException e) {
            logger.error("Failed to open microphone", e);
        }
    }
    
    public void stop() {
        if (!capturing) {
            return;
        }
        
        capturing = false;
        
        if (captureThread != null) {
            captureThread.interrupt();
        }
        
        if (microphone != null) {
            microphone.stop();
            microphone.close();
        }
        
        audioQueue.clear();
        logger.info("Microphone stopped");
    }
    
    /**
     * Capture audio in a loop and push to queue
     */
    private void captureLoop() {
        byte[] buffer = new byte[BUFFER_SIZE];
        
        while (capturing) {
            try {
                int bytesRead = microphone.read(buffer, 0, buffer.length);
                
                if (bytesRead > 0) {
                    // Convert bytes to shorts (16-bit PCM)
                    short[] samples = new short[bytesRead / 2];
                    for (int i = 0; i < samples.length; i++) {
                        samples[i] = (short) ((buffer[i * 2 + 1] << 8) | (buffer[i * 2] & 0xFF));
                    }
                    
                    // Add to queue (non-blocking, drops if full)
                    if (!audioQueue.offer(samples)) {
                        logger.debug("Audio queue full, dropping frame");
                    }
                }
                
            } catch (Exception e) {
                if (capturing) {
                    logger.error("Error capturing audio", e);
                }
            }
        }
    }
    
    /**
     * Get next captured audio frame (non-blocking)
     * @return PCM samples or null if no data available
     */
    public short[] captureFrame() {
        return audioQueue.poll();
    }
    
    /**
     * Get next captured audio frame (blocking)
     * Waits for up to 100ms for a frame to become available
     * @return PCM samples or null if timeout
     */
    public short[] captureFrameBlocking() {
        try {
            return audioQueue.poll(100, java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }
    
    /**
     * Check if microphone is currently capturing
     */
    public boolean isCapturing() {
        return capturing;
    }
}
