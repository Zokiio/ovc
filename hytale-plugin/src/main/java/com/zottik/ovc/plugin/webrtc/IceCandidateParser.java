package com.zottik.ovc.plugin.webrtc;

final class IceCandidateParser {
    record ParsedIceCandidate(
            String foundation,
            int componentId,
            String transport,
            long priority,
            String address,
            int port,
            org.ice4j.ice.CandidateType type
    ) {
    }

    private IceCandidateParser() {
    }

    static ParsedIceCandidate parse(String candidate) {
        if (candidate == null || candidate.isEmpty()) {
            throw new IllegalArgumentException("Empty candidate");
        }

        String candidateLine = candidate;
        if (candidateLine.startsWith("a=")) {
            candidateLine = candidateLine.substring(2);
        }
        if (candidateLine.startsWith("candidate:")) {
            candidateLine = candidateLine.substring("candidate:".length());
        }

        String[] parts = candidateLine.split(" ");
        if (parts.length < 8) {
            throw new IllegalArgumentException("Invalid ICE candidate format");
        }

        String foundation = parts[0];
        int componentId = Integer.parseInt(parts[1]);
        String transport = parts[2];
        long priority = Long.parseLong(parts[3]);
        String address = parts[4];
        int port = Integer.parseInt(parts[5]);
        String type = parts[7];

        return new ParsedIceCandidate(
            foundation,
            componentId,
            transport,
            priority,
            address,
            port,
            mapCandidateType(type)
        );
    }

    static org.ice4j.ice.CandidateType mapCandidateType(String type) {
        if (type == null) {
            return org.ice4j.ice.CandidateType.HOST_CANDIDATE;
        }
        return switch (type) {
            case "host" -> org.ice4j.ice.CandidateType.HOST_CANDIDATE;
            case "srflx" -> org.ice4j.ice.CandidateType.SERVER_REFLEXIVE_CANDIDATE;
            case "relay" -> org.ice4j.ice.CandidateType.RELAYED_CANDIDATE;
            case "prflx" -> org.ice4j.ice.CandidateType.PEER_REFLEXIVE_CANDIDATE;
            default -> org.ice4j.ice.CandidateType.HOST_CANDIDATE;
        };
    }
}
