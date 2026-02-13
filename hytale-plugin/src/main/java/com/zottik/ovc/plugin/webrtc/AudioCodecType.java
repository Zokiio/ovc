package com.zottik.ovc.plugin.webrtc;

enum AudioCodecType {
    PCM,
    OPUS;

    static AudioCodecType fromClientCodec(String codec) {
        if (WebRTCClient.AUDIO_CODEC_OPUS.equalsIgnoreCase(codec)) {
            return OPUS;
        }
        return PCM;
    }
}
