package com.hytale.voicechat.plugin.audio;

import com.hytale.voicechat.common.network.NetworkConfig;
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
    private static final int CHANNELS = 1;

    private final OpusEncoder encoder;
    private final OpusDecoder decoder;

    public OpusCodec() throws IOException, UnknownPlatformException {
        this(NetworkConfig.DEFAULT_SAMPLE_RATE);
    }

    public OpusCodec(int sampleRate) throws IOException, UnknownPlatformException {
        int resolvedRate = NetworkConfig.isSupportedSampleRate(sampleRate)
                ? sampleRate
                : NetworkConfig.DEFAULT_SAMPLE_RATE;
        int frameSize = NetworkConfig.frameSizeForSampleRate(resolvedRate);
        this.encoder = new OpusEncoder(resolvedRate, CHANNELS, OpusEncoder.Application.VOIP);
        this.decoder = new OpusDecoder(resolvedRate, CHANNELS);
        this.decoder.setFrameSize(frameSize);
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
