# Create Browser-Based WebRTC Fallback Client

**Priority:** Low-Medium  
**Category:** Feature  
**Effort:** High

## Problem

Installation requirement is a barrier for public servers and casual users. Adding an optional web-based client would combine our quality-focused native client with the accessibility of competitor solutions.

## Current State
- Native client only (Go + Fyne)
- Requires download and installation
- Not suitable for public servers
- No mobile support

## Proposed Solution

**Hybrid Architecture:**
- Keep native Go client as primary (best quality)
- Add optional browser-based WebRTC client
- Server detects client type and routes appropriately
- Players choose based on preference

**Web Client Features:**
- React + TypeScript frontend
- WebRTC for audio (P2P or server-routed)
- WebSocket for signaling
- Basic proximity audio (gain-based)
- PTT and mute controls
- Responsive design (mobile-friendly)

**Server Changes:**
- Add HTTP/WebSocket endpoint
- Detect client type (native vs web)
- Route audio to appropriate protocol
- Bridge between UDP and WebRTC

## Implementation Tasks
- [ ] Design web client architecture
- [ ] Set up React + TypeScript project
- [ ] Implement WebRTC audio handling
- [ ] Create WebSocket signaling protocol
- [ ] Add HTTP server to Java plugin
- [ ] Implement protocol bridge (UDP ↔ WebRTC)
- [ ] Design minimal UI (PTT, mute, volume)
- [ ] Add mobile-responsive layout
- [ ] Test browser compatibility
- [ ] Add web client build to releases
- [ ] Update documentation

## Acceptance Criteria
- Web client works in modern browsers (Chrome, Firefox, Safari)
- No installation required
- Basic proximity audio functional
- Can communicate with native clients
- Mobile browser support
- Documented deployment instructions

## Considerations
- Web client will have limited features vs native
- Higher latency than native UDP
- May require TURN server for some networks
- Increases maintenance burden

## References
- Comparison doc: "Recommended Hybrid Approach"
- sekwah41's WebRTC implementation
- WebRTC for Web Developers: https://webrtc.org/getting-started/overview

## Labels
`enhancement`, `feature`
