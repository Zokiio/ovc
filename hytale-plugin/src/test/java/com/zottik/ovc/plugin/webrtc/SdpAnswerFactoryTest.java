package com.zottik.ovc.plugin.webrtc;

import org.ice4j.ice.Agent;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SdpAnswerFactoryTest {
    @Test
    void parseOfferExtractsMediaAndDirections() {
        String offer = "v=0\r\n"
            + "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
            + "a=mid:audio0\r\n"
            + "a=sendonly\r\n"
            + "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n"
            + "a=mid:data0\r\n"
            + "a=recvonly\r\n";

        SdpAnswerFactory.OfferDescriptor descriptor = SdpAnswerFactory.parseOffer(offer);

        assertTrue(descriptor.hasAudioMLine());
        assertTrue(descriptor.hasApplicationMLine());
        assertEquals("audio0", descriptor.audioMid());
        assertEquals("data0", descriptor.datachannelMid());
        assertEquals("sendonly", descriptor.audioDirection());
        assertEquals("recvonly", descriptor.datachannelDirection());
    }

    @Test
    void createAnswerSdpBuildsExpectedMediaSections() {
        Agent agent = new Agent();
        SdpAnswerFactory.OfferDescriptor descriptor = SdpAnswerFactory.parseOffer(
            "v=0\r\n"
                + "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"
                + "a=mid:0\r\n"
                + "a=sendrecv\r\n"
                + "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n"
                + "a=mid:1\r\n"
                + "a=sendrecv\r\n"
        );

        String answer = SdpAnswerFactory.createAnswerSdp(agent, descriptor, "AA:BB");

        assertTrue(answer.contains("a=group:BUNDLE 0 1"));
        assertTrue(answer.contains("m=audio 9 UDP/TLS/RTP/SAVPF 111"));
        assertTrue(answer.contains("m=application 9 UDP/DTLS/SCTP webrtc-datachannel"));
        assertTrue(answer.contains("a=fingerprint:sha-256 AA:BB"));
        assertTrue(answer.contains("a=setup:passive"));
    }

    @Test
    void createAnswerSdpRequiresApplicationLine() {
        Agent agent = new Agent();
        SdpAnswerFactory.OfferDescriptor descriptor = new SdpAnswerFactory.OfferDescriptor(
            true,
            false,
            "0",
            null,
            "sendrecv",
            "sendrecv",
            0,
            -1
        );

        assertThrows(IllegalStateException.class, () -> SdpAnswerFactory.createAnswerSdp(agent, descriptor, "AA:BB"));
    }
}
