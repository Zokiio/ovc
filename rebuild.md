# WebRTC SFU Migration: Progress Summary

## ✅ COMPLETED: Phase 1 - Clean House (Native Client Removal)

### What Was Done

**1. Native Go Client Removal**
- ✅ Created git tag `native-client-final` for historical reference
- ✅ Deleted entire `voice-client/` directory (~6,600 lines)
  - Removed Go desktop application (Fyne GUI, PortAudio, Opus codec)
  - Removed all Go client code, Makefiles, configuration

**2. UDP Networking System Removal**
- ✅ Deleted `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/network/`
  - `UDPSocketManager.java` - Core UDP server with packet routing
  - `SimpleVoiceServer.java` - UDP abstractions
- ✅ Deleted `hytale-plugin/common/src/main/java/com/hytale/voicechat/common/packet/`
  - All 11 packet types: AudioPacket, AuthenticationPacket, AuthAckPacket, DisconnectPacket, GroupManagementPacket, GroupStatePacket, GroupListPacket, PlayerNamePacket, ServerShutdownPacket, DisconnectAckPacket, VoicePacket, AudioCodec enum
- ✅ Deleted `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/audio/OpusCodec.java`
  - Removed opus4j (opus-java) based encoder/decoder

**3. Configuration & Plugin Updates**
- ✅ Updated `hytale-plugin/common/src/main/java/com/hytale/voicechat/common/network/NetworkConfig.java`
  - Removed `DEFAULT_VOICE_PORT` (24454)
  - Removed `DEFAULT_API_PORT` (24456)
  - Removed deprecated `SAMPLE_RATE` constant
  - Kept `DEFAULT_SIGNALING_PORT` (24455) for WebSocket
- ✅ Updated `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/HytaleVoiceChatPlugin.java`
  - Removed `udpServer` field
  - Removed `opusCodec` field
  - Removed `voicePort` configuration
  - Removed UDP server initialization and startup
  - Removed `getUdpServer()` method
  - Removed `configure(int voicePort)` method
  - Updated class docs to "WebRTC SFU"
- ✅ Updated `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/webrtc/WebRTCAudioBridge.java`
  - Removed `udpManager` field
  - Removed `sequenceNumber` tracking
  - Removed `receiveAudioFromUDP()` method
  - Removed `routeAudioToUDP()` method
  - Simplified to WebRTC-to-WebRTC routing only
  - Cleaned up verbose debug logging
- ✅ Updated `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/event/PlayerJoinEventSystem.java`
  - Removed `udpServer` field and import
  - Removed UDP disconnection logic in `onEntityRemoved()`
  - Changed constructor to accept `Object ignored` instead of `UDPSocketManager`
- ✅ Updated `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/gui/VoiceChatPage.java`
  - Removed all `plugin.getUdpServer()` calls
  - Updated connection status check to WebRTC-only

**4. Documentation Updates**
- ✅ Updated `README.md`
  - Removed all native Go client sections
  - Updated project description to WebRTC-only
  - Removed native client installation instructions
  - Updated project structure diagram
  - Updated features list (Ice4j, DataChannels, STUN/TURN)
  - Updated prerequisites (removed Go, PortAudio)
- ✅ Updated `hytale-plugin/src/main/resources/manifest.json`
  - Bumped version: `1.0.0` → `2.0.0-webrtc-alpha`
  - Updated description: "with WebRTC SFU"

**5. Verification**
- ✅ Build verification: `./gradlew clean build` passes
- ✅ No compilation errors
- ✅ All changes committed to branch `copilot/setup-webclient-webrtc`
- ✅ Commit hash: `355c5f007dc3068a601b97da02f966af9d91a388`

---

## 🔜 TODO: Phase 2 - Integrate Ice4j + WebRTC Peer Connections (Java Plugin)

### Step 5: Add Ice4j Dependencies
- [ ] Update `hytale-plugin/build.gradle`
  - Add `implementation 'org.ice4j:ice4j:3.0-24-g34c2ce5'`
  - Add `implementation 'org.bouncycastle:bcprov-jdk15on:1.70'` for DTLS-SRTP

### Step 6: Create WebRTC Peer Connection Manager
- [ ] Create `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/webrtc/WebRTCPeerManager.java`
  - Manage `org.ice4j.ice.Agent` instances per web client (Map<UUID, Agent>)
  - Handle SDP offer/answer generation via Ice4j
  - Configure STUN servers (default: `stun:stun.l.google.com:19302`)
  - Setup DataChannel listeners for audio frames
  - Implement cleanup on disconnect
  - Key methods: `createPeerConnection()`, `handleIceCandidate()`, `closePeerConnection()`

### Step 7: Implement DataChannel Audio Handler
- [ ] Create `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/webrtc/DataChannelAudioHandler.java`
  - Receive Opus frames from Ice4j DataChannel
  - Forward to `WebRTCAudioBridge` for proximity routing
  - Receive audio from bridge and send via DataChannel to specific web client
  - Frame format: `[senderId(16)] [opusData]` (binary)
  - Handle backpressure (drop oldest frames if buffer full)

### Step 8: Update Signaling Server
- [ ] Modify `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/webrtc/WebRTCSignalingServer.java`
  - Add message handlers for `offer`, `answer`, `ice_candidate` (currently logged but ignored)
  - On `offer` message:
    1. Extract SDP from JSON
    2. Call `WebRTCPeerManager.createPeerConnection()`
    3. Get `answerSdp` back
    4. Send `answer` message to client
  - On `ice_candidate` message:
    1. Forward to `WebRTCPeerManager.handleIceCandidate()`
    2. Send server ICE candidates back to client
  - Keep authentication flow unchanged

### Step 9: Integrate with Audio Bridge
- [ ] Modify `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/webrtc/WebRTCAudioBridge.java`
  - Replace WebSocket base64 PCM handling with binary Opus frames
  - Wire up `DataChannelAudioHandler` as audio source/sink
  - Keep existing proximity routing logic
  - Optional: add minimal OpusCodec if server-side decode needed (not required for pure SFU)

### Step 10: Add STUN/TURN Configuration
- [ ] Create `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/config/IceServerConfig.java`
  - Load from config file (e.g., `webrtc-config.yml`):
    ```yaml
    ice:
      stun_servers:
        - stun:stun.l.google.com:19302
      turn_servers: []  # optional
    ```
  - Pass to `WebRTCPeerManager` during initialization

---

## 🔜 TODO: Phase 3 - Update Web Client (Browser)

### Step 11: Add Opus Encoding Library
- [ ] Update `web-client/package.json`
  - Add `opus-js` or `opus-recorder` library
  - Run `npm install`

### Step 12: Implement RTCPeerConnection
- [ ] Modify `web-client/js/webrtc.js`
  - Create actual `RTCPeerConnection` (currently just named that, not implemented)
  - Add ICE servers configuration
  - Create DataChannel with `ordered: false, maxRetransmits: 0` for low latency
  - Setup `onicecandidate` handler to send candidates to server
  - Create SDP offer, set local description, send to server
  - Handle remote SDP answer from server
  - Handle ICE candidates from server

### Step 13: Add Opus Encoding to Audio Pipeline
- [ ] Modify `web-client/js/audio.js`
  - Initialize Opus encoder (48kHz mono)
  - In AudioWorklet: encode PCM samples → Opus frames
  - Send Opus frames over DataChannel (not WebSocket)
  - Receive Opus frames from DataChannel
  - Decode Opus → PCM for playback

### Step 14: Update Signaling Handlers
- [ ] Modify `web-client/js/signaling.js`
  - Add handlers for `answer` message → call `webrtcManager.setRemoteAnswer()`
  - Add handlers for `ice_candidate` message → call `webrtcManager.addIceCandidate()`
  - Remove base64 audio message handling (replaced by DataChannel)
  - Keep authentication flow unchanged

### Step 15: Wire Up UI
- [ ] Modify `web-client/js/main.js`
  - Create `WebRTCManager` instance
  - On connect: authenticate → create WebRTC offer → start audio capture
  - Handle DataChannel `onmessage` for received audio
  - Update connection status based on `RTCPeerConnection.connectionState`

### Step 16: Update HTML for Dependencies
- [ ] Modify `web-client/index.html`
  - Add Opus library script tag (or bundle via Vite)
  - Update instructions (remove native client references)

---

## 🔜 TODO: Phase 4 - Testing & Refinement

### Step 17: Unit Test Ice4j Integration
- [ ] Create `hytale-plugin/src/test/java/.../WebRTCPeerManagerTest.java`
  - Test SDP offer/answer exchange with mock client
  - Test ICE candidate gathering
  - Test DataChannel establishment

### Step 18: Integration Test with Browser
- [ ] Start plugin with built JAR on Hytale server
- [ ] Serve web client via `npm run dev` (Vite dev server)
- [ ] Connect web client from browser
- [ ] Verify:
  - WebSocket authentication succeeds
  - SDP offer/answer exchange completes
  - ICE candidates exchanged
  - DataChannel opens (`readyState === 'open'`)
  - Audio frames transmit (check RTC stats in DevTools)

### Step 19: Proximity Routing Test
- [ ] Spawn 3 test players in Hytale at known positions
- [ ] Connect 3 web clients (one per player)
- [ ] Speak into client 1
- [ ] Verify:
  - Players within 30 blocks hear audio
  - Players outside 30 blocks don't hear audio
  - Check `PlayerPositionTracker` logs for distance calculations

### Step 20: Load Test
- [ ] Use Playwright/Selenium to spawn 50+ browser instances
- [ ] Each connects as different player
- [ ] Simulate audio transmission (generate Opus frames)
- [ ] Monitor:
  - Server CPU usage
  - Network bandwidth (~30-50 kbps per client)
  - Audio latency (<100ms for 200 concurrent clients)

### Step 21: NAT Traversal Test
- [ ] Test from external network (mobile hotspot)
- [ ] Verify STUN server resolves public IP
- [ ] If fails: Add TURN server to `IceServerConfig`
- [ ] Document firewall requirements (port 24455 TCP, ephemeral UDP for RTP)

---

## 📊 Current State

### Working Components
- ✅ `PlayerPositionTracker` - Player position tracking with distance calculations
- ✅ `WebRTCSignalingServer` - WebSocket server on port 24455 (basic authentication working)
- ✅ `WebRTCAudioBridge` - Proximity routing framework (needs WebRTC integration)
- ✅ `GroupManager` - Voice group management (isolated/non-isolated groups)
- ✅ Web client - Basic UI, WebSocket connection, audio capture (needs WebRTC peer connections)
- ✅ `VoiceGroupCommand` - In-game commands for group management

### Needs Implementation
- ❌ Ice4j peer connection management
- ❌ DataChannel audio handling
- ❌ SDP offer/answer exchange (server-side)
- ❌ ICE candidate exchange (bidirectional)
- ❌ Opus codec in browser (encoding/decoding)
- ❌ RTCPeerConnection in browser (currently just a placeholder)
- ❌ DataChannel audio streaming (currently uses WebSocket base64 PCM)

### Technical Decisions Made
1. **Architecture**: Centralized SFU (not P2P mesh) - server routes all audio
2. **Transport**: WebRTC DataChannels (not Media Tracks) - simpler for audio-only use case
3. **Codec**: Opus 48kHz mono (20ms frames, 960 samples per frame)
4. **Library**: Ice4j + BouncyCastle (not full Jitsi Videobridge, not webrtc-java wrapper)
5. **Scale target**: 2-200 concurrent users per server
6. **Proximity**: 30 blocks default (configurable via `/proximity` command)
7. **NAT Traversal**: STUN initially, TURN as fallback if needed

### Repository Status
- **Branch**: `copilot/setup-webclient-webrtc`
- **Last commit**: Phase 1 complete (`355c5f007dc3068a601b97da02f966af9d91a388`)
- **Active PR**: #44 "Add WebRTC web client with WebSocket signaling server"
- **Build status**: ✅ PASSING (`./gradlew clean build`)

---

## 🎯 Next Immediate Step

**Phase 2, Step 5**: Add Ice4j and BouncyCastle dependencies to `hytale-plugin/build.gradle`

When ready to continue, we'll start by adding the required dependencies, then implement the `WebRTCPeerManager` class to handle ICE/DTLS peer connections with DataChannel support.

---

## 📝 Implementation Notes

### Key Architectural Changes
- **Before**: Native Go client (UDP port 24454) + Web client proxy (WebSocket port 24455)
- **After**: Web client only (WebRTC SFU) with WebSocket signaling (port 24455) + DataChannels for media

### Why DataChannels over Media Tracks?
1. **Simpler implementation** - No RTP/RTCP codec negotiation complexity
2. **Sufficient for audio** - SCTP overhead (~20 bytes/frame) acceptable for 2-200 users
3. **Easier debugging** - Binary message inspection simpler than RTP packet streams
4. **Future flexibility** - Can send metadata alongside audio in same channel
5. **Trade-off accepted** - Slightly higher latency (~5-10ms) vs Media Tracks, but implementation time saved

### Proximity Routing Architecture
```
Web Client A (speaking)
    ↓ [Opus frame via DataChannel]
Ice4j Agent (DTLS-SRTP)
    ↓ [decrypt, forward to bridge]
WebRTCAudioBridge
    ↓ [query PlayerPositionTracker]
    ↓ [calculate distances]
    ↓ [filter by proximity (30 blocks)]
    ↓ [forward to nearby clients]
Ice4j Agents (for clients B, C)
    ↓ [encrypt, send via DataChannel]
Web Clients B, C (listening)
```

### Sample Rate Enforcement
- Server enforces **48kHz** for all clients
- Reason: Avoid codec mismatches and resampling overhead
- Browser Opus encoder must match this rate

### Frame Format (DataChannel Binary Messages)
```
[0-15]  : Sender UUID (16 bytes, as two longs: MSB, LSB)
[16-n]  : Opus-encoded audio data (variable length, typically ~20-60 bytes for 20ms frame)
```

---

## 🚨 Known Issues & Limitations

### Current WebSocket Proxy Limitations (to be replaced)
- ❌ Uses base64-encoded PCM (~150+ kbps per client) - inefficient
- ❌ No encryption beyond TLS (no DTLS-SRTP)
- ❌ No proper codec negotiation
- ❌ Server-side audio bridging adds latency (~50-100ms)

### Post-Migration Expected Improvements
- ✅ Opus compression (~8-12 kbps per client) - 15x bandwidth reduction
- ✅ DTLS-SRTP encryption (end-to-end security)
- ✅ Lower latency (~20-40ms with jitter buffer)
- ✅ NAT traversal via STUN/TURN
- ✅ Browser-native audio handling (no custom serialization)

---

## 📚 Reference Documentation

### Ice4j Resources
- GitHub: https://github.com/jitsi/ice4j
- Used by: Jitsi Videobridge, Jitsi Meet
- Handles: ICE (RFC 5245), STUN (RFC 5389), TURN (RFC 5766)

### WebRTC Browser APIs
- MDN RTCPeerConnection: https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection
- MDN RTCDataChannel: https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel
- DTLS-SRTP: Automatic in WebRTC (no manual configuration needed)

### Opus Codec
- Official: https://opus-codec.org/
- opus-js (browser): https://github.com/chris-rudmin/opus-recorder
- opus4j (Java, if needed): https://github.com/RWTH-i5-IDSG/opus4j

### STUN/TURN Servers
- Google STUN: `stun:stun.l.google.com:19302` (free, public)
- Cloudflare TURN: https://www.cloudflare.com/products/calls/ (paid)
- Self-hosted: coturn (https://github.com/coturn/coturn)

---

## 🔄 Migration Rollback Plan

If Ice4j integration proves too complex or unstable:

### Fallback Option 1: Enhanced WebSocket Proxy
- Keep current WebSocket proxy model
- Add Opus encoding in browser (`opus-recorder`)
- Send Opus as binary WebSocket messages (not base64 PCM)
- Server decodes/re-encodes if needed for mixing
- **Pros**: Simpler, no WebRTC complexity
- **Cons**: Still centralized, higher server CPU, no DTLS-SRTP, worse NAT traversal

### Fallback Option 2: Sidecar SFU (LiveKit/Mediasoup)
- Deploy LiveKit or Mediasoup as separate service
- Java plugin communicates via REST/gRPC
- Offloads all WebRTC complexity to dedicated SFU
- **Pros**: Production-grade, well-tested, handles 500+ users
- **Cons**: Operational overhead, another service to deploy, inter-process latency

### Rollback to Native Client
- Git tag `native-client-final` preserves last working version
- Can restore `voice-client/` directory if needed
- Would need to also restore UDP packet system from git history

---

## ⏱️ Estimated Timeline

### Conservative Estimate (Single Developer)
- **Phase 2**: 3-5 days (Ice4j integration, peer manager, DataChannel handler)
- **Phase 3**: 2-3 days (Browser WebRTC implementation, Opus integration)
- **Phase 4**: 2-4 days (Testing, debugging, NAT traversal, load testing)
- **Total**: 7-12 days (1.5-2.5 weeks)

### Optimistic Estimate (Experienced with Ice4j/WebRTC)
- **Phase 2**: 2-3 days
- **Phase 3**: 1-2 days
- **Phase 4**: 1-2 days
- **Total**: 4-7 days (1 week)

### Realistic with Unknowns
- Add 30-50% buffer for debugging NAT issues, DTLS handshake problems, codec quirks
- **Total**: 10-18 days (2-3.5 weeks)
