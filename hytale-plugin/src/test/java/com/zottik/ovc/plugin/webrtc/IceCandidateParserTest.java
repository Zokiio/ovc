package com.zottik.ovc.plugin.webrtc;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class IceCandidateParserTest {
    @Test
    void parseCandidateExtractsFields() {
        IceCandidateParser.ParsedIceCandidate parsed = IceCandidateParser.parse(
            "candidate:1 1 udp 2122260223 192.168.0.1 54321 typ srflx"
        );

        assertEquals("1", parsed.foundation());
        assertEquals(1, parsed.componentId());
        assertEquals("udp", parsed.transport());
        assertEquals(2122260223L, parsed.priority());
        assertEquals("192.168.0.1", parsed.address());
        assertEquals(54321, parsed.port());
        assertEquals(org.ice4j.ice.CandidateType.SERVER_REFLEXIVE_CANDIDATE, parsed.type());
    }

    @Test
    void parseCandidateAcceptsPrefixedLines() {
        IceCandidateParser.ParsedIceCandidate parsed = IceCandidateParser.parse(
            "a=candidate:2 1 udp 2122260223 10.0.0.10 50000 typ host"
        );

        assertEquals("2", parsed.foundation());
        assertEquals(org.ice4j.ice.CandidateType.HOST_CANDIDATE, parsed.type());
    }

    @Test
    void parseCandidateRejectsInvalidFormat() {
        assertThrows(IllegalArgumentException.class, () -> IceCandidateParser.parse("candidate:bad"));
    }
}
