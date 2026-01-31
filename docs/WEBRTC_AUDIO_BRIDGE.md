# WebRTC Audio Bridge: Server-Side Proxy Model

## Current Status: Server-Side Audio Proxy

⚠️ **IMPORTANT**: The current "WebRTC Audio Bridge" is actually a server-side proxy audio router, NOT a WebRTC peer connection bridge. This document describes the current proxy implementation.

### What This System Does (Current)
- Routes audio from web clients to native UDP clients via server
- Routes audio from native UDP clients to web clients via server
- Uses WebSocket for all audio transport (not WebRTC peer connections)
- Applies proximity-based routing for all client types

### What This System Does NOT Do (Yet)
- Establish direct WebRTC peer connections between clients
- Handle WebRTC SDP offer/answer exchange
- Manage ICE candidates for P2P connections
- Use WebRTC DataChannels for audio

## Problem Statement (Original Design Goal)
Web clients could connect and authenticate to the WebRTC signaling server, but audio was never actually routed between:
1. Web clients and native UDP clients (proximity-based)
2. Native UDP clients back to web clients

## Current Solution: Server-Side Audio Proxy

Created a server-side audio routing system that proxies audio between web and native clients.

### Key Components

#### 1. **Audio Flow (Current - WebSocket Proxy)**
- Web client sends audio via WebSocket (base64-encoded PCM)
- Server receives audio from web client
- Server checks proximity: sender → nearby native clients
- Server forwards audio to native clients via UDP
- Native client sends audio via UDP
- Server receives audio and checks proximity: sender → nearby web clients
- Server sends audio to web client via WebSocket (base64-encoded)

#### 2. **Signaling Message Types**
- `authenticate`: Client → Server (username)
- `auth_success`: Server → Client (session info)
- `audio`: Bidirectional (base64-encoded PCM audio frames)
- `disconnect`: Client → Server
- `offer`: Client received (UNSUPPORTED - mapped to warning log)
- `answer`: Client received (UNSUPPORTED - mapped to warning log)
- `ice_candidate`: Client received (UNSUPPORTED - mapped to warning log)

#### 3. **Proximity Calculation**
- Distance calculated using player positions (X, Y, Z coordinates)
- Default proximity threshold: 30 blocks
- World-aware: only routes audio to players in same world
- Implemented in `PlayerPositionTracker`

### Data Flow Diagram (Current)

**Web Client → Native Clients:**
```
WebSocket Message (audio)
  ↓
Server WebSocket Handler
  ↓
Get sender position from PlayerPositionTracker
  ↓
Find nearby native clients (within 30 blocks)
  ↓
Send UDP AudioPacket to each nearby client
```

**Native Client → Web Clients:**
```
UDP AudioPacket
  ↓
UDPSocketManager receives packet
  ↓
Get sender position from PlayerPositionTracker
  ↓
Find nearby web clients (within 30 blocks)
  ↓
Send WebSocket audio message (base64) to each nearby client
```

### Message Format

#### Current (Audio via WebSocket)
```json
{
  "type": "audio",
  "data": {
    "audioData": "base64_encoded_pcm_bytes"
  }
}
```

#### Future (WebRTC Peer - Not Implemented)
```json
{
  "type": "offer",
  "data": {
    "sdp": "v=0\no=...",
    "type": "offer"
  }
}
```

## Implementation Status

### ✅ Complete
- WebSocket signaling server (port 24455)
- Web client audio capture and transmission
- Server-side proximity calculation
- Audio routing to nearby clients
- Web client audio playback

### ⚠️ Limitations & Caveats
- All audio passes through server (adds latency)
- Audio not encrypted on wire (base64 transmission)
- Single WebSocket multiplexes signaling + audio (potential bottleneck)
- No audio compression (PCM only)
- No peer-to-peer connection support
- Requires server to be accessible to web clients

## Testing the Current System

### Setup
1. Build plugin: `./gradlew clean build`
2. Start Hytale server with plugin JAR
3. Ensure server is accessible on port 24455

### Web Client
1. Open web client in browser
2. Connect to `ws://server:24455/voice`
3. Authenticate with username (requires player to exist on server)
4. Audio should capture from microphone

### Native Client
1. Start native Go client (voice-client)
2. Connect to server (port 24454)
3. Authenticate with username

### Expected Behavior
- Audio from web client should reach nearby native clients
- Audio from native client should reach nearby web clients
- All audio is routed through server (not P2P)
- Proximity-based delivery (30 blocks default)

## Future: WebRTC Peer-to-Peer (Not Currently Implemented)

### What Will Change
- SDP offer/answer exchange instead of audio proxy
- WebRTC DataChannel for encrypted audio
- Direct peer connection (lower latency)
- ICE candidate exchange for NAT traversal

### Migration Path
1. Add WebRTC library to server (e.g., Jitsi)
2. Implement SDP generation and answer creation
3. Setup ICE candidate exchange via WebSocket
4. Establish DataChannel for audio
5. Remove server audio proxy forwarding
6. Test with mixed client types

### Why Not Yet?
- Complexity: WebRTC library integration needed
- Breaking change: Signaling protocol changes
- Testing: More complex to verify peer connections
- Browser compatibility: Stricter HTTPS/security requirements
