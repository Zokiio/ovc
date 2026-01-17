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
 */
public class OpusCodec implements Closeable {
    private static final int SAMPLE_RATE = 48000;
    private static final int FRAME_SIZE = 960;
    private static final int CHANNELS = 1;

    private final OpusEncoder encoder;
    private final OpusDecoder decoder;

    public OpusCodec() throws IOException, UnknownPlatformException {
        this.encoder = new OpusEncoder(SAMPLE_RATE, CHANNELS, OpusEncoder.Application.VOIP);
        this.decoder = new OpusDecoder(SAMPLE_RATE, CHANNELS);
        this.decoder.setFrameSize(FRAME_SIZE);
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

    @Override
    public void close() {
        encoder.close();
        decoder.close();
    }
}
