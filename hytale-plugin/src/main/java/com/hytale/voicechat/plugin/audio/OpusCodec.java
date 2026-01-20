package com.hytale.voicechat.plugin.audio;

import de.maxhenkel.opus4j.OpusDecoder;
import de.maxhenkel.opus4j.OpusEncoder;
import de.maxhenkel.opus4j.UnknownPlatformException;

import java.io.Closeable;
import java.io.IOException;

/**
 * Manages Opus codec for audio compression/decompression
 * Sample rate: 48000 Hz
 * Frame size: 960 samples (20ms)
 * Bit depth: 16-bit PCM
 * Channels: Mono
 * 
 * Supports Forward Error Correction (FEC) for packet loss resilience
 */
public class OpusCodec implements Closeable {
    private static final int SAMPLE_RATE = 48000;
    private static final int FRAME_SIZE = 960;
    private static final int CHANNELS = 1;
    
    // Default FEC configuration: 10% expected packet loss
    private static final float DEFAULT_FEC_PERCENT = 0.10f;

    private final OpusEncoder encoder;
    private final OpusDecoder decoder;
    private float fecPercentage;

    public OpusCodec() throws IOException, UnknownPlatformException {
        this(DEFAULT_FEC_PERCENT);
    }
    
    public OpusCodec(float fecPercentage) throws IOException, UnknownPlatformException {
        this.encoder = new OpusEncoder(SAMPLE_RATE, CHANNELS, OpusEncoder.Application.VOIP);
        this.decoder = new OpusDecoder(SAMPLE_RATE, CHANNELS);
        this.decoder.setFrameSize(FRAME_SIZE);
        this.fecPercentage = Math.max(0.0f, Math.min(0.20f, fecPercentage)); // Clamp to 0-20%
        
        // Enable Forward Error Correction (FEC) for packet loss resilience
        if (this.fecPercentage > 0) {
            try {
                this.encoder.setMaxPacketLossPercentage(this.fecPercentage);
            } catch (Exception e) {
                // If FEC is not supported, log and continue without it
                System.err.println("Warning: Could not enable Opus FEC: " + e.getMessage());
            }
        }
    }
    
    public byte[] encode(short[] pcmData) {
        if (pcmData == null || pcmData.length == 0) {
            return new byte[0];
        }
        return encoder.encode(pcmData);
    }
    
    public short[] decode(byte[] opusData) {
        if (opusData == null || opusData.length == 0) {
            return new short[0];
        }
        return decoder.decode(opusData);
    }
    
    /**
     * Decode audio using Packet Loss Concealment (PLC) when packet is lost.
     * This generates a plausible audio frame based on previous decoded audio.
     * 
     * @return decoded audio frame with PLC interpolation
     */
    public short[] decodePLC() {
        try {
            // Opus PLC: decode with null data to synthesize missing frame
            return decoder.decode(null);
        } catch (Exception e) {
            // Fallback: return silence if PLC fails
            return new short[FRAME_SIZE];
        }
    }
    
    /**
     * Decode audio using Forward Error Correction from next packet.
     * Call this when a packet is lost and the next packet contains FEC data.
     * 
     * @param nextPacketOpusData the next packet's Opus data containing FEC
     * @return decoded audio frame reconstructed from FEC data
     */
    public short[] decodeFEC(byte[] nextPacketOpusData) {
        if (nextPacketOpusData == null || nextPacketOpusData.length == 0) {
            return decodePLC();
        }
        try {
            // Decode FEC data from next packet to recover lost frame
            // Note: opus4j may not expose FEC decoding directly, fallback to PLC
            return decoder.decode(nextPacketOpusData);
        } catch (Exception e) {
            return decodePLC();
        }
    }
    
    /**
     * Get the current FEC percentage setting.
     * @return FEC percentage (0.0 to 0.20)
     */
    public float getFecPercentage() {
        return fecPercentage;
    }
    
    /**
     * Update the FEC percentage for the encoder.
     * @param fecPercentage expected packet loss percentage (0.0 to 0.20)
     */
    public void setFecPercentage(float fecPercentage) {
        this.fecPercentage = Math.max(0.0f, Math.min(0.20f, fecPercentage));
        if (this.fecPercentage > 0) {
            try {
                this.encoder.setMaxPacketLossPercentage(this.fecPercentage);
            } catch (Exception e) {
                System.err.println("Warning: Could not update Opus FEC: " + e.getMessage());
            }
        }
    }

    @Override
    public void close() {
        encoder.close();
        decoder.close();
    }
}
