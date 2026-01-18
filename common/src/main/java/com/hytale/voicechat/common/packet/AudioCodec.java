package com.hytale.voicechat.common.packet;

public final class AudioCodec {
    public static final byte PCM = 0x00;
    public static final byte OPUS = 0x01;

    private AudioCodec() {
    }

    public static boolean isSupported(byte codecWithFlags) {
        byte codec = (byte) (codecWithFlags & 0x7F); // strip feature flags
        return codec == PCM || codec == OPUS;
    }

    public static byte baseCodec(byte codecWithFlags) {
        return (byte) (codecWithFlags & 0x7F);
    }
}
