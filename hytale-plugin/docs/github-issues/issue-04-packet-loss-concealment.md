# Add Packet Loss Concealment (PLC)

**Priority:** Medium  
**Category:** Audio Quality  
**Effort:** Medium

## Problem

Current implementation has no packet loss handling. Lost UDP packets result in audio dropouts. Opus codec includes built-in PLC, but we're not utilizing it. This is critical for quality over unreliable networks.

## Current State
- Lost packets = silence gaps
- No detection of packet loss
- No interpolation or concealment
- Jarring audio experience on poor networks

## Proposed Solution

**Client-Side PLC:**
1. Track sequence numbers to detect lost packets
2. Use Opus decoder's FEC (Forward Error Correction)
3. Use Opus PLC (Packet Loss Concealment) for interpolation
4. Implement jitter buffer for reordering

**Server-Side FEC:**
1. Enable Opus in-band FEC
2. Send redundant data in next packet
3. Configurable FEC percentage (5-20%)

## Implementation Tasks
- [ ] Add sequence number tracking in Go client
- [ ] Detect missing packets in audio stream
- [ ] Enable Opus FEC in encoder (server)
- [ ] Use Opus PLC in decoder (client)
- [ ] Implement jitter buffer (50-150ms)
- [ ] Add statistics tracking (packet loss %)
- [ ] Display network quality in UI
- [ ] Make FEC percentage configurable
- [ ] Test with simulated packet loss

## Acceptance Criteria
- Graceful handling of 5-10% packet loss
- Smooth audio with occasional dropouts
- FEC increases bitrate by <20%
- Network stats visible in client UI
- Configurable jitter buffer size

## References
- Opus FEC documentation: https://opus-codec.org/docs/opus_api-1.3.1/group__opus__decoder.html
- Comparison doc: "Future Enhancement Opportunities > Packet loss concealment"

## Labels
`enhancement`, `audio-quality`
