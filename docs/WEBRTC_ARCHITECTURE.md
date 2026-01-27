# WebRTC Web Client Architecture

## Overview

This document describes the WebRTC integration for browser-based voice chat clients in the Hytale Voice Chat system.

## Architecture Components

### 1. Native Client (Existing)
- **Technology**: Go desktop application
- **Protocol**: UDP on port 24454
- **Audio**: PortAudio capture/playback, Opus codec
- **Connection**: Direct UDP to server

### 2. Web Client (New)
- **Technology**: HTML5 + JavaScript
- **Protocol**: WebRTC + WebSocket signaling
- **Audio**: Web Audio API, Opus (built into WebRTC)
- **Connection**: WebRTC PeerConnection via signaling server

### 3. Signaling Server (New)
- **Technology**: Java WebSocket server (embedded in plugin)
- **Port**: 24455 (configurable via NetworkConfig)
- **Purpose**: Coordinate WebRTC connections between web clients and server
- **Protocol**: JSON messages over WebSocket

## Communication Flow

### WebRTC Connection Establishment

```
1. Web Client connects to WebSocket signaling server (ws://server:24455)
2. Client sends authentication message with username
3. Server validates and responds with session info
4. Client creates RTCPeerConnection and generates SDP offer
5. Client sends SDP offer to server via WebSocket
6. Server creates answer SDP and sends back
7. ICE candidates exchanged between client and server
8. WebRTC connection established (DTLS-SRTP encrypted)
9. Audio streaming begins via WebRTC DataChannel
```

### Audio Routing

```
┌─────────────────┐         UDP          ┌──────────────────────┐
│  Native Client  │◄──────────────────────┤                      │
│   (Go + UDP)    │                       │   Hytale Plugin      │
└─────────────────┘                       │   Voice Router       │
                                          │                      │
┌─────────────────┐      WebSocket       │  ┌────────────────┐  │
│   Web Client    │◄─────────────────────┤──┤ WebSocket      │  │
│   (Browser)     │      Signaling       │  │ Signaling      │  │
│                 │                       │  └────────────────┘  │
│                 │      WebRTC          │                      │
│                 │◄─────────────────────┤  ┌────────────────┐  │
│                 │      Audio           │──┤ WebRTC         │  │
│                 │      Encrypted       │  │ Audio Bridge   │  │
└─────────────────┘                       │  └────────────────┘  │
                                          └──────────────────────┘
                                                    │
                                                    ▼
                                          Proximity-based routing
                                          (same for both client types)
```

## Design Decisions

### 1. WebRTC vs Pure WebSocket
- **Chosen**: WebRTC with WebSocket signaling
- **Rationale**: 
  - WebRTC provides native Opus encoding/decoding in browsers
  - DTLS-SRTP encryption built-in
  - Optimized for real-time audio
  - NAT traversal via ICE

### 2. Signaling Protocol
- **Format**: JSON over WebSocket
- **Messages**:
  - `authenticate`: Client → Server (username)
  - `auth_success`: Server → Client (session info)
  - `offer`: Client → Server (SDP offer)
  - `answer`: Server → Client (SDP answer)
  - `ice_candidate`: Bidirectional (ICE candidates)
  - `audio`: Bidirectional (audio data)

### 3. Audio Bridge Architecture
- WebRTC audio packets converted to internal AudioPacket format
- Same proximity routing logic applies to both client types
- Audio from UDP clients forwarded to WebRTC clients via DataChannel
- Audio from WebRTC clients forwarded to UDP clients

### 4. Dual Protocol Support
- Server maintains separate listeners:
  - UDP on port 24454 (native clients)
  - WebSocket on port 24455 (web client signaling)
  - WebRTC DataChannel (web client audio)
- Unified client registry maps both connection types
- Position tracking works identically for both client types

## Security Considerations

### WebRTC Built-in Security
- DTLS handshake for secure channel establishment
- SRTP for encrypted audio streams
- Certificate fingerprint verification in SDP

### Additional Measures
- WebSocket origin validation
- Same authentication flow as UDP clients
- Session token validation
- Rate limiting on signaling messages

## Browser Compatibility

### Minimum Requirements
- Chrome/Edge 74+ (WebRTC support)
- Firefox 66+ (WebRTC support)
- Safari 12+ (WebRTC support, requires HTTPS)
- Opera 62+ (WebRTC support)

### Required APIs
- WebRTC (RTCPeerConnection)
- Web Audio API (AudioContext)
- WebSocket
- MediaDevices.getUserMedia()

## Configuration

### Server Configuration (NetworkConfig.java)
```java
public static final int DEFAULT_VOICE_PORT = 24454;      // UDP
public static final int DEFAULT_SIGNALING_PORT = 24455;  // WebSocket
public static final int DEFAULT_API_PORT = 24456;        // HTTP API (future)
```

### Web Client Configuration
- Server URL: ws://hostname:24455/voice
- STUN servers: Google public STUN (configurable)
- ICE gathering timeout: 5 seconds
- Audio codec: Opus only (48kHz, mono)

## Implementation Notes

### Phase 1: Signaling Server
1. Add WebSocket server to plugin
2. Implement JSON message protocol
3. Add client session management
4. Test basic connection flow

### Phase 2: WebRTC Bridge
1. Add WebRTC library to plugin (e.g., webrtc-java)
2. Implement SDP exchange
3. Setup ICE candidate exchange
4. Establish DataChannel for audio

### Phase 3: Web Client
1. Create HTML/CSS UI
2. Implement WebSocket client
3. Setup WebRTC PeerConnection
4. Implement audio capture/playback
5. Connect to signaling server

### Phase 4: Audio Integration
1. Convert WebRTC audio to AudioPacket format
2. Integrate with existing proximity routing
3. Test mixed UDP + WebRTC clients
4. Performance optimization

## Future Enhancements

- TURN server support for restrictive NATs
- Video support (webcam for spatial audio visualization)
- Screen sharing for collaboration
- Recording and playback
- Advanced audio processing (noise cancellation, echo cancellation)
- Progressive Web App (PWA) support for offline usage
