# Add UDP Encryption (DTLS or Custom)

**Priority:** High  
**Category:** Security  
**Effort:** Medium-High

## Problem

Currently, voice audio is transmitted over UDP without encryption, making it vulnerable to eavesdropping. Both competitor solutions (sekwah41 and giulienw use TLS/SRTP) provide encryption, and this is a critical security gap for production deployments.

## Current State
- Raw UDP packets between client and server
- Username-only authentication
- No packet integrity verification

## Proposed Solution

**Option 1: DTLS (Recommended)**
- Implement DTLS 1.2/1.3 for UDP encryption
- Use Go's `crypto/tls` and `pion/dtls` for client
- Use Java's DTLS implementation for server
- Maintains low latency while adding security

**Option 2: Custom Encryption**
- Implement ChaCha20-Poly1305 AEAD encryption
- Exchange keys during authentication handshake
- Lower complexity than DTLS, still secure

## Implementation Tasks
- [ ] Choose encryption approach (DTLS vs custom)
- [ ] Implement key exchange during authentication
- [ ] Add encryption to audio packets
- [ ] Add packet integrity checks (MAC/AEAD)
- [ ] Update protocol documentation
- [ ] Add configuration for cipher suites
- [ ] Test performance impact on latency

## Acceptance Criteria
- All UDP voice traffic is encrypted
- Latency increase <10ms
- Configurable encryption on/off
- Protocol version negotiation
- Documentation updated

## References
- Mumble uses DTLS: https://github.com/mumble-voip/mumble
- pion/dtls Go library: https://github.com/pion/dtls
- Comparison doc section: "Technical Debt & Risks > Security Risks"

## Labels
`security`, `enhancement`, `high-priority`
