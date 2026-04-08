package com.zottik.ovc.plugin.webrtc;

import org.ice4j.ice.Agent;

final class SdpAnswerFactory {
    record OfferDescriptor(
            boolean hasAudioMLine,
            boolean hasApplicationMLine,
            String audioMid,
            String datachannelMid,
            String audioDirection,
            String datachannelDirection,
            int audioMLineIndex,
            int dataMLineIndex
    ) {
    }

    private SdpAnswerFactory() {
    }

    static OfferDescriptor parseOffer(String offerSdp) {
        boolean hasAudioMLine = hasMediaLine(offerSdp, "m=audio");
        boolean hasApplicationMLine = hasMediaLine(offerSdp, "m=application");
        String audioMid = null;
        String datachannelMid = null;
        String audioDirection = "sendrecv";
        String datachannelDirection = "sendrecv";
        int audioMLineIndex = -1;
        int dataMLineIndex = -1;

        String[] lines = offerSdp.split("\r\n");
        boolean inAudioSection = false;
        boolean inDataChannelSection = false;
        int currentMLineIndex = -1;

        for (String line : lines) {
            if (line.startsWith("m=")) {
                currentMLineIndex++;
                inAudioSection = line.startsWith("m=audio");
                inDataChannelSection = line.startsWith("m=application");

                if (inAudioSection && audioMLineIndex < 0) {
                    audioMLineIndex = currentMLineIndex;
                }
                if (inDataChannelSection && dataMLineIndex < 0) {
                    dataMLineIndex = currentMLineIndex;
                }
            }

            if (line.startsWith("a=mid:")) {
                String mid = line.substring("a=mid:".length()).trim();
                if (inAudioSection && audioMid == null) {
                    audioMid = mid;
                } else if (inDataChannelSection && datachannelMid == null) {
                    datachannelMid = mid;
                }
            }

            if (inAudioSection && isDirectionLine(line)) {
                audioDirection = line.substring("a=".length());
            }
            if (inDataChannelSection && isDirectionLine(line)) {
                datachannelDirection = line.substring("a=".length());
            }
        }

        return new OfferDescriptor(
            hasAudioMLine,
            hasApplicationMLine,
            audioMid,
            datachannelMid,
            audioDirection,
            datachannelDirection,
            audioMLineIndex,
            dataMLineIndex
        );
    }

    static String createAnswerSdp(Agent iceAgent, OfferDescriptor offer, String dtlsFingerprint) {
        StringBuilder answer = new StringBuilder();
        answer.append("v=0\r\n");
        answer.append("o=- 0 0 IN IP4 0.0.0.0\r\n");
        answer.append("s=Obsolete Voice Chat\r\n");
        answer.append("t=0 0\r\n");
        answer.append("a=ice-options:trickle\r\n");

        StringBuilder bundleLineBuilder = new StringBuilder();
        bundleLineBuilder.append("a=group:BUNDLE");

        if (!offer.hasApplicationMLine()) {
            throw new IllegalStateException("Cannot create SDP answer without application m-line");
        }

        String answerAudioDirection = invertDirection(offer.audioDirection());
        String answerDataChannelDirection = invertDirection(offer.datachannelDirection());

        if (offer.hasAudioMLine()) {
            bundleLineBuilder.append(" ").append(offer.audioMid() != null ? offer.audioMid() : "0");
        }
        if (offer.hasApplicationMLine()) {
            bundleLineBuilder.append(" ").append(offer.datachannelMid() != null ? offer.datachannelMid() : "1");
        }
        answer.append(bundleLineBuilder).append("\r\n");

        String iceUfrag = iceAgent.getLocalUfrag();
        String icePwd = iceAgent.getLocalPassword();

        if (offer.hasAudioMLine()) {
            answer.append("m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n");
            answer.append("c=IN IP4 0.0.0.0\r\n");
            answer.append("a=rtcp:9 IN IP4 0.0.0.0\r\n");
            answer.append("a=ice-ufrag:").append(iceUfrag).append("\r\n");
            answer.append("a=ice-pwd:").append(icePwd).append("\r\n");
            answer.append("a=fingerprint:sha-256 ").append(dtlsFingerprint).append("\r\n");
            answer.append("a=setup:passive\r\n");
            answer.append("a=mid:").append(offer.audioMid() != null ? offer.audioMid() : "0").append("\r\n");
            answer.append("a=").append(answerAudioDirection).append("\r\n");
            answer.append("a=rtcp-mux\r\n");
            answer.append("a=rtpmap:111 opus/48000/2\r\n");
        }

        if (offer.hasApplicationMLine()) {
            answer.append("m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n");
            answer.append("c=IN IP4 0.0.0.0\r\n");
            answer.append("a=ice-ufrag:").append(iceUfrag).append("\r\n");
            answer.append("a=ice-pwd:").append(icePwd).append("\r\n");
            answer.append("a=fingerprint:sha-256 ").append(dtlsFingerprint).append("\r\n");
            answer.append("a=setup:passive\r\n");
            answer.append("a=mid:").append(offer.datachannelMid() != null ? offer.datachannelMid() : "1").append("\r\n");
            answer.append("a=").append(answerDataChannelDirection).append("\r\n");
            answer.append("a=sctp-port:5000\r\n");
            answer.append("a=max-message-size:1073741823\r\n");
        }

        return answer.toString();
    }

    static String invertDirection(String direction) {
        return switch (direction) {
            case "sendonly" -> "recvonly";
            case "recvonly" -> "sendonly";
            case "sendrecv" -> "sendrecv";
            case "inactive" -> "inactive";
            default -> "sendrecv";
        };
    }

    private static boolean hasMediaLine(String sdp, String mediaPrefix) {
        if (sdp == null || sdp.isEmpty()) {
            return false;
        }
        String[] lines = sdp.split("\r\n");
        for (String line : lines) {
            if (line.startsWith(mediaPrefix)) {
                return true;
            }
        }
        return false;
    }

    private static boolean isDirectionLine(String line) {
        return "a=sendrecv".equals(line)
                || "a=sendonly".equals(line)
                || "a=recvonly".equals(line)
                || "a=inactive".equals(line);
    }
}
