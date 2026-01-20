# Implement NAT Traversal (STUN/UPnP)

**Priority:** High  
**Category:** Networking  
**Effort:** High

## Problem

Current implementation requires manual port forwarding (UDP 24454), which is a significant barrier for casual users. sekwah41's WebRTC solution handles NAT traversal automatically, making it more accessible for public servers.

## Current State
- Requires manual router configuration
- Fails for users behind CGNAT
- No automatic discovery
- Port forwarding instructions in documentation

## Proposed Solution

**Phase 1: UPnP Port Mapping**
- Client attempts automatic port forwarding via UPnP/NAT-PMP
- Fallback to manual configuration if fails
- Display status in client UI

**Phase 2: STUN Support**
- Implement STUN client to discover public IP/port
- Share NAT mapping information with server
- Enable symmetric NAT detection

**Phase 3: TURN Relay (Optional)**
- Add optional TURN relay fallback
- Configure relay server in plugin
- Higher latency but works everywhere

## Implementation Tasks
- [ ] Add UPnP library to Go client (goupnp)
- [ ] Implement automatic port mapping on client startup
- [ ] Add STUN client implementation
- [ ] Display NAT status in client UI (Open/Moderate/Strict)
- [ ] Add connection diagnostics
- [ ] Update server to handle STUN requests
- [ ] (Optional) Implement TURN relay server
- [ ] Add configuration options
- [ ] Test behind various NAT types

## Acceptance Criteria
- Client automatically forwards port when possible
- Clear UI indication of NAT status
- Graceful fallback to manual configuration
- Works behind moderate NAT without manual setup
- Documentation for CGNAT scenarios

## References
- goupnp library: https://github.com/huin/goupnp
- STUN RFC 5389: https://datatracker.ietf.org/doc/html/rfc5389
- Comparison doc section: "Weaknesses > No NAT Traversal"

## Labels
`networking`, `enhancement`, `high-priority`
