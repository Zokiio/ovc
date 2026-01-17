package com.hytale.voicechat.client.audio;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.sound.sampled.*;

/**
 * Manages speaker output using Java Sound API
 * TODO: Upgrade to OpenAL for 3D positional audio
 */
public class SpeakerManager {
    private static final Logger logger = LoggerFactory.getLogger(SpeakerManager.class);
    
    // Audio format: 48kHz, 16-bit, mono
    private static final int SAMPLE_RATE = 48000;
    private static final int SAMPLE_SIZE_BITS = 16;
    private static final int CHANNELS = 1;
    private static final int BUFFER_SIZE = 1920 * 2; // 40ms buffer
    
    private SourceDataLine speaker;
    private volatile boolean playing;
    
    public SpeakerManager() {
        this.playing = false;
    }
    
    public void start() {
        if (playing) {
            logger.warn("Speaker already playing");
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
            
            DataLine.Info info = new DataLine.Info(SourceDataLine.class, format);
            
            if (!AudioSystem.isLineSupported(info)) {
                logger.error("Speaker line not supported");
                return;
            }
            
            speaker = (SourceDataLine) AudioSystem.getLine(info);
            speaker.open(format, BUFFER_SIZE);
            speaker.start();
            
            playing = true;
            logger.info("Speaker started: {}Hz, {}ch, {}bits", SAMPLE_RATE, CHANNELS, SAMPLE_SIZE_BITS);
            
        } catch (LineUnavailableException e) {
            logger.error("Failed to open speaker", e);
        }
    }
    
    public void stop() {
        if (!playing) {
            return;
        }
        
        playing = false;
        
        if (speaker != null) {
            speaker.drain();
            speaker.stop();
            speaker.close();
        }
        
        logger.info("Speaker stopped");
    }
    
    /**
     * Play audio frame immediately
     * @param samples PCM samples (16-bit)
     */
    public void playFrame(short[] samples) {
        if (!playing || speaker == null || samples == null) {
            return;
        }
        
        try {
            // Convert shorts to bytes
            byte[] buffer = new byte[samples.length * 2];
            for (int i = 0; i < samples.length; i++) {
                buffer[i * 2] = (byte) (samples[i] & 0xFF);
                buffer[i * 2 + 1] = (byte) ((samples[i] >> 8) & 0xFF);
            }
            
            // Write to speaker line
            speaker.write(buffer, 0, buffer.length);
            
        } catch (Exception e) {
            logger.error("Error playing audio", e);
        }
    }
    
    /**
     * Play audio with 3D positioning (future OpenAL implementation)
     * @param pcmData PCM samples
     * @param playerId Player identifier
     * @param x X position
     * @param y Y position
     * @param z Z position
     */
    public void playAudio(short[] pcmData, String playerId, float x, float y, float z) {
        // TODO: Implement OpenAL 3D audio positioning
        // For now, just play normally
        playFrame(pcmData);
    }
    
    /**
     * Check if speaker is currently playing
     */
    public boolean isPlaying() {
        return playing;
    }
}
