# WebRTC Web Client Architecture

## CURRENT STATUS: Server-Side Proxy Model

⚠️ **IMPORTANT**: The current web client implementation uses a **server-side proxy model** for audio routing, NOT full WebRTC peer-to-peer connections. This document describes both the current implementation and the aspirational future architecture with direct WebRTC connections.

| Aspect | Current Implementation | Future (WebRTC Peer-to-Peer) |
|--------|------------------------|------------------------------|
| Audio Transport | WebSocket (server proxy) | WebRTC DataChannel (direct P2P) |
| Signaling | WebSocket JSON messages | WebSocket JSON for SDP/ICE only |
| Connection Type | Server mediates all audio | Peer-to-peer with server for signaling only |
| Security | TLS on WebSocket | DTLS-SRTP encrypted |
| Scalability | Server handles audio forwarding | Distributed (server overhead minimal) |
| Latency | One extra server hop | Lower (direct routing) |

## Overview

This document describes the architecture for browser-based voice chat clients in the Hytale Voice Chat system.

## Current Architecture Components

### 1. Native Client (Existing)
- **Technology**: Go desktop application
- **Protocol**: UDP on port 24454
- **Audio**: PortAudio capture/playback, Opus codec
- **Connection**: Direct UDP to server

### 2. Web Client (Current - Server Proxy)
- **Technology**: HTML5 + JavaScript
- **Protocol**: WebSocket signaling + WebSocket audio (both on same connection)
- **Audio**: Web Audio API capture, base64-encoded transmission
- **Connection**: WebSocket to signaling server (port 24455)
- **Server Role**: Receives audio from all clients, routes based on proximity/groups

### 3. Web Client (Future - WebRTC Peer)
- **Technology**: HTML5 + JavaScript
- **Protocol**: WebSocket signaling + WebRTC DataChannel audio
- **Audio**: Web Audio API capture, WebRTC codec (Opus)
- **Connection**: WebRTC PeerConnection to server
- **Server Role**: Signaling only, audio flows directly

### 4. Signaling Server (Current)
- **Technology**: Java WebSocket server (embedded in plugin)
- **Port**: 24455 (configurable via NetworkConfig)
- **Purpose**: 
  - Authenticate web clients
  - Route audio messages between web and native clients (current)
  - Coordinate WebRTC connections (future)
- **Protocol**: JSON messages over WebSocket

## Current Communication Flow (Server Proxy Model)

### Connection Establishment
```
1. Web Client connects to WebSocket signaling server (ws://server:24455/voice)
2. Client sends authentication message with username
3. Server validates and responds with auth_success
4. Server identifies client position via plugin player tracking
5. Audio transport ready (same WebSocket connection)
```

### Audio Flow (Server Proxy)
```
┌─────────────────┐         UDP          ┌──────────────────────┐
│  Native Client  │◄──────────────────────┤                      │
│   (Go + UDP)    │                       │   Hytale Plugin      │
└─────────────────┘                       │   Voice Router       │
                                          │                      │
                                          │  ┌────────────────┐  │
                                          │  │ Position       │  │
┌─────────────────┐     WebSocket       │  │ Tracker        │  │
│   Web Client    │───────────────────────┤  └────────────────┘  │
│   (Browser)     │     Audio (base64)   │                      │
└─────────────────┘                       │  ┌────────────────┐  │
                                          │  │ Proximity      │  │
                                          │  │ Router         │  │
                                          │  └────────────────┘  │
                                          └──────────────────────┘
                                                    │
                                                    ▼
                                          All client types:
                                          - Route within 30 blocks
                                          - Consider world boundaries
```

### Signaling Message Types (Current)
- `authenticate`: Client → Server (username)
- `auth_success`: Server → Client (session info, clientId)
- `auth_error`: Server → Client (authentication failure)
- `audio`: Bidirectional (base64-encoded audio data)
- `disconnect`: Client → Server
- `offer`: Client received (UNSUPPORTED - logs warning)
- `answer`: Client received (UNSUPPORTED - logs warning)
- `ice_candidate`: Client received (UNSUPPORTED - logs warning)

**Note**: The `offer`, `answer`, and `ice_candidate` messages are explicitly handled but not supported in the current proxy model. They are logged with guidance to documentation for users who attempt direct peer connections.

## Design Decisions

### Why Server Proxy (Current)?
1. **Simplicity**: No need for WebRTC library in browser initially
2. **Compatibility**: Works with existing Java plugin architecture
3. **Reliability**: Single server point coordinates all routing
4. **Development**: Easier to implement iteratively
5. **Debugging**: All audio passes through server, easier to observe

### Migration Path to WebRTC (Future)
See `docs/WEBRTC_MIGRATION.md` (if needed) for detailed migration strategy.

## Browser Compatibility

### Current Requirements (Server Proxy)
- Any modern browser with Web Audio API
- Chrome/Edge 50+ 
- Firefox 40+
- Safari 10+
- Opera 37+

### Future Requirements (WebRTC Peer-to-Peer)
- Chrome/Edge 74+ (WebRTC support)
- Firefox 66+ (WebRTC support)
- Safari 12+ (WebRTC support, requires HTTPS)
- Opera 62+ (WebRTC support)

### Required APIs
- **Current**: Web Audio API, WebSocket, MediaDevices.getUserMedia()
- **Future**: RTCPeerConnection, WebRTC DataChannel

## Configuration

### Server Configuration (NetworkConfig.java)
```java
public static final int DEFAULT_VOICE_PORT = 24454;      // UDP
public static final int DEFAULT_SIGNALING_PORT = 24455;  // WebSocket signaling
// public static final int DEFAULT_WEBRTC_PORT = 24456;  // Future: WebRTC peer port
```

### Web Client Configuration (Current)
- Server URL: `ws://hostname:24455/voice`
- Audio format: Base64-encoded PCM
- Frame size: 960 samples (20ms at 48kHz)
- Sample rate: 48kHz (mono)
- Proximity: 30 blocks (configurable via server groups/commands)

### Web Client Configuration (Future - WebRTC)
- Signaling URL: `ws://hostname:24455/voice`
- WebRTC peer URL: Server address for RTCPeerConnection
- STUN servers: Google public STUN (configurable)
- ICE gathering timeout: 5 seconds
- Audio codec: Opus only (48kHz, mono)

## Implementation Status

- ✅ **Phase 1: Signaling Server** - Complete
  - WebSocket server running on port 24455
  - JSON message protocol
  - Client session management
  - Basic authentication

- ✅ **Phase 2: Web Client UI** - Complete
  - HTML/CSS interface
  - WebSocket connection
  - Local audio capture via Web Audio API
  - Audio playback

- ✅ **Phase 3: Audio Routing (Server Proxy)** - Complete
  - Audio routing via server
  - Proximity-based delivery
  - Bidirectional web ↔ native client audio

- ⏳ **Phase 4: WebRTC Peer Support (Future)**
  - [ ] Add WebRTC library to server (Jitsi?)
  - [ ] Implement SDP generation/answer
  - [ ] Setup ICE candidate exchange
  - [ ] Establish DataChannel
  - [ ] Migrate signaling protocol (SDP messages)
  - [ ] Test mixed proxy + P2P clients

## Current Limitations

- **No Direct P2P**: All audio flows through server, adding latency and server CPU overhead
- **No Encryption on Audio**: WebSocket uses TLS, but audio content transmitted as base64 strings (not encrypted)
- **Single WebSocket**: Multiplexes both signaling and audio on one connection (potential bottleneck)
- **No NAT Traversal**: Not needed (server is single point), but adds dependency on accessible server
- **Codec Limitation**: Audio transported as base64 raw PCM, no compression
- **Browser Support**: Requires functional Web Audio API for capture
- **No ICE**: No NAT traversal negotiation needed for current model

## Future Architecture: WebRTC Peer-to-Peer

### WebRTC Connection Establishment (Future)
```
1. Web Client connects to WebSocket signaling server
2. Client sends authentication message
3. Server validates and responds with session info
4. Client creates RTCPeerConnection with server as peer
5. Client generates SDP offer and sends to server via WebSocket
6. Server processes offer, generates SDP answer and sends back
7. ICE candidates exchanged between client and server
8. WebRTC connection established (DTLS-SRTP encrypted)
9. Audio streaming begins via WebRTC DataChannel (or MediaTrack)
```

### Audio Flow (Future WebRTC)
```
┌─────────────────┐                      ┌──────────────────────┐
│  Native Client  │     UDP              │   Hytale Plugin      │
│   (Go + UDP)    │◄─────────────────────┤                      │
└─────────────────┘                       │  ┌────────────────┐  │
                                          │  │ UDP Server     │  │
                                          │  │ (port 24454)   │  │
┌─────────────────┐                       │  └────────────────┘  │
│   Web Client    │                       │                      │
│   (Browser)     │      WebSocket        │  ┌────────────────┐  │
│                 │◄─────────────────────┤──┤ Signaling      │  │
│                 │    (signaling only)   │  │ Server         │  │
│                 │                       │  │ (port 24455)   │  │
│                 │      WebRTC           │  └────────────────┘  │
│                 │◄─────────────────────┤  ┌────────────────┐  │
│                 │   DataChannel         │  │ WebRTC Peer    │  │
│                 │   (audio encrypted)   │  │ (port 24456)   │  │
└─────────────────┘                       │  └────────────────┘  │
                                          └──────────────────────┘
```

### Benefits of Future Architecture
- **Direct P2P**: Lower latency, reduced server CPU
- **Encrypted Audio**: DTLS-SRTP encryption for media stream
- **Better Codec**: WebRTC uses Opus codec natively
- **NAT Traversal**: ICE handles NAT/firewall traversal
- **Scalable**: Server only handles signaling, not audio forwarding
