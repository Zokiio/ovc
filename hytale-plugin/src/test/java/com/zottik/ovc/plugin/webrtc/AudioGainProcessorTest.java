package com.zottik.ovc.plugin.webrtc;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AudioGainProcessorTest {
    @Test
    void calculateVolumeMultiplierRespectsRangeBoundaries() {
        AudioGainProcessor processor = new AudioGainProcessor(1.5);

        double fullVolume = processor.calculateVolumeMultiplier(0.0, 50.0);
        double silent = processor.calculateVolumeMultiplier(50.0, 50.0);
        double mid = processor.calculateVolumeMultiplier(40.0, 50.0);

        assertEquals(1.0, fullVolume, 0.0001);
        assertEquals(0.0, silent, 0.0001);
        assertTrue(mid > 0.0 && mid < 1.0);
    }

    @Test
    void scalePcmVolumeHalvesSampleAmplitude() {
        AudioGainProcessor processor = new AudioGainProcessor(1.5);
        byte[] audio = new byte[] {0x10, 0x00, (byte) 0xF0, (byte) 0xFF};

        byte[] scaled = processor.scalePcmVolume(audio, 0.5);

        assertEquals(0x08, scaled[0]);
        assertEquals(0x00, scaled[1]);
        assertEquals((byte) 0xF8, scaled[2]);
        assertEquals((byte) 0xFF, scaled[3]);
    }
}
