# Improvement Issues Based on Competitive Analysis

This document contains GitHub issues created from the competitive analysis. Copy each section into a new GitHub issue.

---

## Issue #1: Add UDP Encryption (DTLS or Custom)

**Priority:** High  
**Category:** Security  
**Effort:** Medium-High

### Problem

Currently, voice audio is transmitted over UDP without encryption, making it vulnerable to eavesdropping. Both competitor solutions (sekwah41 and giulienw use TLS/SRTP) provide encryption, and this is a critical security gap for production deployments.

### Current State
- Raw UDP packets between client and server
- Username-only authentication
- No packet integrity verification

### Proposed Solution

**Option 1: DTLS (Recommended)**
- Implement DTLS 1.2/1.3 for UDP encryption
- Use Go's `crypto/tls` and `pion/dtls` for client
- Use Java's DTLS implementation for server
- Maintains low latency while adding security

**Option 2: Custom Encryption**
- Implement ChaCha20-Poly1305 AEAD encryption
- Exchange keys during authentication handshake
- Lower complexity than DTLS, still secure

### Implementation Tasks
- [ ] Choose encryption approach (DTLS vs custom)
- [ ] Implement key exchange during authentication
- [ ] Add encryption to audio packets
- [ ] Add packet integrity checks (MAC/AEAD)
- [ ] Update protocol documentation
- [ ] Add configuration for cipher suites
- [ ] Test performance impact on latency

### Acceptance Criteria
- All UDP voice traffic is encrypted
- Latency increase <10ms
- Configurable encryption on/off
- Protocol version negotiation
- Documentation updated

### References
- Mumble uses DTLS: https://github.com/mumble-voip/mumble
- pion/dtls Go library: https://github.com/pion/dtls
- Comparison doc section: "Technical Debt & Risks > Security Risks"

---

## Issue #2: Implement NAT Traversal (STUN/UPnP)

**Priority:** High  
**Category:** Networking  
**Effort:** High

### Problem

Current implementation requires manual port forwarding (UDP 24454), which is a significant barrier for casual users. sekwah41's WebRTC solution handles NAT traversal automatically, making it more accessible for public servers.

### Current State
- Requires manual router configuration
- Fails for users behind CGNAT
- No automatic discovery
- Port forwarding instructions in documentation

### Proposed Solution

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

### Implementation Tasks
- [ ] Add UPnP library to Go client (goupnp)
- [ ] Implement automatic port mapping on client startup
- [ ] Add STUN client implementation
- [ ] Display NAT status in client UI (Open/Moderate/Strict)
- [ ] Add connection diagnostics
- [ ] Update server to handle STUN requests
- [ ] (Optional) Implement TURN relay server
- [ ] Add configuration options
- [ ] Test behind various NAT types

### Acceptance Criteria
- Client automatically forwards port when possible
- Clear UI indication of NAT status
- Graceful fallback to manual configuration
- Works behind moderate NAT without manual setup
- Documentation for CGNAT scenarios

### References
- goupnp library: https://github.com/huin/goupnp
- STUN RFC 5389: https://datatracker.ietf.org/doc/html/rfc5389
- Comparison doc section: "Weaknesses > No NAT Traversal"

---

## Issue #3: Implement Token-Based Authentication

**Priority:** Medium  
**Category:** Security  
**Effort:** Medium

### Problem

Username-only authentication is insecure and lacks protection against impersonation. Competitor solutions use JWT tokens (sekwah41) and OAuth 2.0 (giulienw). We need secure, server-verified authentication.

### Current State
- Client sends username as plain text
- No password or token verification
- Server trusts client-provided identity
- Vulnerable to impersonation

### Proposed Solution

**In-Game Token Generation:**
1. Player runs `/voice` command in Hytale
2. Server generates time-limited JWT token
3. Server displays clickable auth code or QR code
4. Player enters token in voice client
5. Client authenticates with token
6. Token expires after use or timeout (5 minutes)

**Token Format:**
```json
{
  "player_uuid": "...",
  "username": "...",
  "server_id": "...",
  "issued_at": 1234567890,
  "expires_at": 1234567890
}
```

### Implementation Tasks
- [ ] Add JWT library to plugin (java-jwt or jjwt)
- [ ] Generate tokens on `/voice` command
- [ ] Display auth code in chat (6-digit code)
- [ ] Add token input field in Go client
- [ ] Implement token verification on server
- [ ] Add token expiration and refresh
- [ ] Store active tokens in memory/cache
- [ ] Add configuration for token lifetime
- [ ] Update protocol for token-based auth
- [ ] Add rate limiting on token generation

### Acceptance Criteria
- Players authenticate using server-generated tokens
- Tokens expire after 5 minutes
- One-time use tokens (invalidated after auth)
- Server verifies player identity
- Clear error messages for invalid/expired tokens
- Backwards compatibility mode (optional)

### References
- jjwt library: https://github.com/jwtk/jjwt
- sekwah41's token approach in comparison
- Comparison doc section: "Technical Debt & Risks > Security Risks"

---

## Issue #4: Add Packet Loss Concealment (PLC)

**Priority:** Medium  
**Category:** Audio Quality  
**Effort:** Medium

### Problem

Current implementation has no packet loss handling. Lost UDP packets result in audio dropouts. Opus codec includes built-in PLC, but we're not utilizing it. This is critical for quality over unreliable networks.

### Current State
- Lost packets = silence gaps
- No detection of packet loss
- No interpolation or concealment
- Jarring audio experience on poor networks

### Proposed Solution

**Client-Side PLC:**
1. Track sequence numbers to detect lost packets
2. Use Opus decoder's FEC (Forward Error Correction)
3. Use Opus PLC (Packet Loss Concealment) for interpolation
4. Implement jitter buffer for reordering

**Server-Side FEC:**
1. Enable Opus in-band FEC
2. Send redundant data in next packet
3. Configurable FEC percentage (5-20%)

### Implementation Tasks
- [ ] Add sequence number tracking in Go client
- [ ] Detect missing packets in audio stream
- [ ] Enable Opus FEC in encoder (server)
- [ ] Use Opus PLC in decoder (client)
- [ ] Implement jitter buffer (50-150ms)
- [ ] Add statistics tracking (packet loss %)
- [ ] Display network quality in UI
- [ ] Make FEC percentage configurable
- [ ] Test with simulated packet loss

### Acceptance Criteria
- Graceful handling of 5-10% packet loss
- Smooth audio with occasional dropouts
- FEC increases bitrate by <20%
- Network stats visible in client UI
- Configurable jitter buffer size

### References
- Opus FEC documentation: https://opus-codec.org/docs/opus_api-1.3.1/group__opus__decoder.html
- Comparison doc: "Future Enhancement Opportunities > Packet loss concealment"

---

## Issue #5: Create Browser-Based WebRTC Fallback Client

**Priority:** Low-Medium  
**Category:** Feature  
**Effort:** High

### Problem

Installation requirement is a barrier for public servers and casual users. Adding an optional web-based client would combine our quality-focused native client with the accessibility of competitor solutions.

### Current State
- Native client only (Go + Fyne)
- Requires download and installation
- Not suitable for public servers
- No mobile support

### Proposed Solution

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

### Implementation Tasks
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

### Acceptance Criteria
- Web client works in modern browsers (Chrome, Firefox, Safari)
- No installation required
- Basic proximity audio functional
- Can communicate with native clients
- Mobile browser support
- Documented deployment instructions

### Considerations
- Web client will have limited features vs native
- Higher latency than native UDP
- May require TURN server for some networks
- Increases maintenance burden

### References
- Comparison doc: "Recommended Hybrid Approach"
- sekwah41's WebRTC implementation
- WebRTC for Web Developers: https://webrtc.org/getting-started/overview

---

## Issue #6: Add Comprehensive Test Coverage

**Priority:** Medium  
**Category:** Testing  
**Effort:** Medium

### Problem

Limited test coverage makes refactoring risky and bugs more likely. giulienw's solution has unit tests (v1.0.0 quality). We need tests for protocol, audio processing, and network logic.

### Current State
- Minimal or no automated tests
- Manual testing only
- No CI/CD pipeline
- Regression risk with changes

### Proposed Solution

**Go Client Tests:**
- Unit tests for audio processing
- Protocol encoding/decoding tests
- Mock audio device tests
- Configuration handling tests

**Java Plugin Tests:**
- Unit tests for packet handling
- Proximity calculation tests
- Opus codec tests
- Player tracking tests

**Integration Tests:**
- End-to-end client-server tests
- Multi-client scenarios
- Network failure scenarios
- Protocol compatibility tests

### Implementation Tasks

**Client (Go):**
- [ ] Set up Go testing framework
- [ ] Write tests for audio_manager.go
- [ ] Write tests for voice_client.go (network)
- [ ] Write protocol encode/decode tests
- [ ] Mock PortAudio for testing
- [ ] Add benchmark tests for audio pipeline

**Plugin (Java):**
- [ ] Set up JUnit 5
- [ ] Write tests for OpusCodec
- [ ] Write tests for PlayerPositionTracker
- [ ] Write tests for packet serialization
- [ ] Write tests for proximity calculations
- [ ] Mock Netty for network tests

**Integration:**
- [ ] Set up Docker test environment
- [ ] Write client-server integration tests
- [ ] Test multiple concurrent clients
- [ ] Test packet loss scenarios
- [ ] Test authentication flow

**CI/CD:**
- [ ] Set up GitHub Actions workflow
- [ ] Run tests on push/PR
- [ ] Add code coverage reporting
- [ ] Cross-platform build tests

### Acceptance Criteria
- >70% code coverage on critical paths
- All tests pass in CI
- Integration tests for main flows
- Documented testing approach
- Coverage reports generated

### References
- Go testing: https://go.dev/doc/tutorial/add-a-test
- JUnit 5: https://junit.org/junit5/docs/current/user-guide/
- Comparison doc: "Maturity & Completeness"

---

## Issue #7: Implement Rate Limiting and DoS Protection

**Priority:** Medium  
**Category:** Security  
**Effort:** Low-Medium

### Problem

No rate limiting or DoS protection makes server vulnerable to abuse. Malicious clients could flood server with packets, impacting legitimate users.

### Current State
- No connection limits
- No rate limiting on authentication
- No packet rate limiting
- No bandwidth throttling
- Vulnerable to amplification attacks

### Proposed Solution

**Connection Limits:**
- Max connections per IP
- Max total connections
- Connection timeout for inactive clients

**Rate Limiting:**
- Max authentication attempts per IP (5/minute)
- Max audio packets per second per client (100/s)
- Max bandwidth per client (50 kbps)
- Global bandwidth cap

**Protection Mechanisms:**
- Block IPs after failed auth attempts
- Detect and disconnect flooding clients
- Configurable whitelist/blacklist
- Graceful degradation under load

### Implementation Tasks
- [ ] Add connection tracking per IP
- [ ] Implement token bucket rate limiter
- [ ] Add max connections configuration
- [ ] Track packet rates per client
- [ ] Implement bandwidth throttling
- [ ] Add IP blacklist/whitelist
- [ ] Log suspicious activity
- [ ] Add admin commands to view/manage limits
- [ ] Add metrics for monitoring
- [ ] Configure reasonable defaults

### Acceptance Criteria
- Server handles 1000+ auth attempts gracefully
- Flooding clients auto-disconnected
- Legitimate users unaffected by abuse
- Configurable limits in plugin config
- Admin commands to manage restrictions
- Metrics exposed for monitoring

### Configuration Example
```yaml
security:
  max_connections_global: 100
  max_connections_per_ip: 3
  auth_rate_limit: 5/minute
  packet_rate_limit: 100/second
  bandwidth_per_client: 50kbps
  auto_ban_threshold: 10
  ban_duration: 300
```

### References
- Comparison doc: "Technical Debt & Risks > Security Risks"
- Guava RateLimiter: https://github.com/google/guava/wiki/RateLimiterExplained

---

## Issue #8: Add Admin/Moderation Features

**Priority:** Low  
**Category:** Feature  
**Effort:** Low-Medium

### Problem

No administrative controls for server operators. Moderators cannot mute disruptive users, monitor activity, or manage voice channels. Essential for public servers.

### Current State
- No admin commands
- Cannot mute/kick users
- No activity monitoring
- No permission system

### Proposed Solution

**Admin Commands:**
- `/voice mute <player>` - Mute player's microphone (server-side)
- `/voice unmute <player>` - Unmute player
- `/voice kick <player>` - Disconnect player from voice
- `/voice ban <player>` - Ban player from voice chat
- `/voice list` - List connected voice clients
- `/voice stats` - Show server statistics
- `/voice reload` - Reload configuration

**Permissions:**
- `hytale.voicechat.admin` - Full admin access
- `hytale.voicechat.moderator` - Mute/kick only
- `hytale.voicechat.use` - Use voice chat

**Features:**
- Server-side mute (block packets from player)
- Kick (disconnect client, allow reconnect)
- Ban (persistent, prevents reconnection)
- Activity log (join/leave/mute events)
- Statistics (bandwidth, users, uptime)

### Implementation Tasks
- [ ] Create admin command handler
- [ ] Implement server-side mute (drop packets)
- [ ] Implement kick functionality
- [ ] Add persistent ban list (file/database)
- [ ] Add permission checks
- [ ] Implement `/voice list` with online users
- [ ] Add statistics tracking
- [ ] Create activity log
- [ ] Add admin notifications (chat messages)
- [ ] Update documentation with commands

### Acceptance Criteria
- Moderators can mute/kick disruptive users
- Mute persists across reconnections
- Ban list persists server restart
- Commands respect permissions
- Activity logged to file
- Statistics accurate and useful

### Command Examples
```
/voice list
  Players online: 5
  - Steve (192.168.1.100) - 12.3kbps
  - Alex (192.168.1.101) - 11.8kbps [MUTED]
  
/voice stats
  Uptime: 2h 34m
  Total connections: 23
  Current users: 5
  Bandwidth: 61.5kbps
  Packets/sec: 250
  
/voice mute Steve
  Steve has been muted by admin.
```

### References
- Comparison doc: "Future Enhancement Opportunities > Admin features"

---

## Issue #9: Implement Adaptive Bitrate Control

**Priority:** Low  
**Category:** Audio Quality  
**Effort:** Medium

### Problem

Fixed 12kbps bitrate doesn't adapt to network conditions. High-quality networks are underutilized, while poor networks experience dropouts. Discord uses 8-128kbps adaptive bitrate.

### Current State
- Fixed Opus bitrate (~12kbps)
- No network quality detection
- Same quality for all conditions
- Inefficient bandwidth usage

### Proposed Solution

**Network Quality Detection:**
- Monitor packet loss percentage
- Track round-trip time (RTT)
- Measure jitter
- Calculate quality score (0-100)

**Adaptive Algorithm:**
- Start at medium quality (24kbps)
- Increase bitrate if quality high (low loss, low RTT)
- Decrease bitrate if quality low (high loss, high RTT)
- Adjust every 5-10 seconds
- Range: 8kbps (poor) to 64kbps (excellent)

**Quality Presets:**
- Poor: 8kbps, 20ms frames, no FEC
- Low: 12kbps, 20ms frames, 5% FEC
- Medium: 24kbps, 20ms frames, 10% FEC (default)
- High: 48kbps, 20ms frames, 15% FEC
- Excellent: 64kbps, 10ms frames, 20% FEC

### Implementation Tasks
- [ ] Add network quality monitoring
- [ ] Track packet loss percentage
- [ ] Implement RTT measurement (ping/pong)
- [ ] Calculate quality score algorithm
- [ ] Implement bitrate adjustment logic
- [ ] Add configuration for min/max bitrate
- [ ] Display current bitrate in client UI
- [ ] Add manual quality override option
- [ ] Test with simulated network conditions
- [ ] Add quality statistics to logs

### Acceptance Criteria
- Bitrate adapts to network conditions
- Smooth quality transitions
- No abrupt changes (hysteresis)
- User can override with manual setting
- Current quality visible in UI
- Works with packet loss concealment (Issue #4)

### Configuration Example
```yaml
audio:
  adaptive_bitrate:
    enabled: true
    min_bitrate: 8000
    max_bitrate: 64000
    adjustment_interval: 10s
    quality_thresholds:
      excellent: 100  # 0% loss, <50ms RTT
      high: 80        # <2% loss, <100ms RTT
      medium: 60      # <5% loss, <150ms RTT
      low: 40         # <10% loss, <200ms RTT
      poor: 0         # >10% loss or >200ms RTT
```

### References
- Opus bitrate recommendations: https://wiki.xiph.org/Opus_Recommended_Settings
- Discord's adaptive bitrate
- Comparison doc: "Future Enhancement Opportunities > Adaptive bitrate"

---

## Issue #10: Create User Installation Guides

**Priority:** Low  
**Category:** Documentation  
**Effort:** Low

### Problem

Technical documentation exists, but no user-friendly installation guides for non-technical players. This increases support burden and limits adoption.

### Current State
- README.md is developer-focused
- No step-by-step player guides
- No troubleshooting documentation
- No screenshots/videos

### Proposed Solution

**Player Quick Start Guide:**
- Step-by-step installation (Windows/Mac/Linux)
- Screenshots of each step
- Video walkthrough (optional)
- Common issues and solutions

**Server Admin Guide:**
- Plugin installation steps
- Configuration explained simply
- Port forwarding instructions
- Common setup issues

**Troubleshooting Guide:**
- "Can't connect" scenarios
- Audio issues (no mic, no sound)
- Network/firewall problems
- Performance issues

### Implementation Tasks
- [ ] Write Windows installation guide
- [ ] Write macOS installation guide
- [ ] Write Linux installation guide
- [ ] Create server admin setup guide
- [ ] Write troubleshooting guide
- [ ] Take screenshots for each step
- [ ] (Optional) Record video tutorial
- [ ] Add FAQ section
- [ ] Create quick reference card
- [ ] Translate to common languages (optional)

### Acceptance Criteria
- Non-technical users can install without help
- Each OS has detailed guide
- Screenshots for every step
- Troubleshooting covers 90% of issues
- Links from in-game `/voice help`

### Document Structure
```
docs/
  user-guide/
    QUICK_START.md
    INSTALLATION_WINDOWS.md
    INSTALLATION_MAC.md
    INSTALLATION_LINUX.md
    SERVER_SETUP.md
    TROUBLESHOOTING.md
    FAQ.md
  images/
    install-step-*.png
  videos/
    quick-start.mp4 (optional)
```

### References
- Comparison doc: "Deployment Complexity"
- Consider creating website for docs (GitHub Pages)

---

## Summary Table

| Issue # | Title | Priority | Effort | Category |
|---------|-------|----------|--------|----------|
| 1 | Add UDP Encryption (DTLS or Custom) | High | Medium-High | Security |
| 2 | Implement NAT Traversal (STUN/UPnP) | High | High | Networking |
| 3 | Implement Token-Based Authentication | Medium | Medium | Security |
| 4 | Add Packet Loss Concealment (PLC) | Medium | Medium | Audio Quality |
| 5 | Create Browser-Based WebRTC Fallback Client | Low-Medium | High | Feature |
| 6 | Add Comprehensive Test Coverage | Medium | Medium | Testing |
| 7 | Implement Rate Limiting and DoS Protection | Medium | Low-Medium | Security |
| 8 | Add Admin/Moderation Features | Low | Low-Medium | Feature |
| 9 | Implement Adaptive Bitrate Control | Low | Medium | Audio Quality |
| 10 | Create User Installation Guides | Low | Low | Documentation |

## Recommended Implementation Order

**Phase 1 (MVP Security & Stability):**
1. Issue #3: Token-Based Authentication
2. Issue #7: Rate Limiting and DoS Protection
3. Issue #6: Add Test Coverage
4. Issue #10: User Guides

**Phase 2 (Network Reliability):**
5. Issue #4: Packet Loss Concealment
6. Issue #2: NAT Traversal
7. Issue #9: Adaptive Bitrate

**Phase 3 (Advanced Features):**
8. Issue #1: UDP Encryption
9. Issue #8: Admin/Moderation Features
10. Issue #5: Browser-Based Client (optional)

---

## Creating GitHub Issues

To create these as GitHub issues:

1. Navigate to your repository on GitHub
2. Go to "Issues" tab
3. Click "New Issue"
4. Copy/paste each issue section
5. Add appropriate labels (security, enhancement, documentation, etc.)
6. Assign to milestone/project if needed
7. Link related issues

**Suggested Labels:**
- `security` (Issues 1, 3, 7)
- `networking` (Issues 2, 4)
- `enhancement` (Issues 5, 8, 9)
- `testing` (Issue 6)
- `documentation` (Issue 10)
- `high-priority` (Issues 1, 2)
- `good-first-issue` (Issue 10)
