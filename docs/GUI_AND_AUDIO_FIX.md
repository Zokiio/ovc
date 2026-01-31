# WebRTC Client GUI Integration and Audio Issues - Implementation Status

## Problem Statement

### 1. GUI Not Updating for Web Clients
The GUI shows "Voice Client - Disconnected" even though web clients successfully authenticate. This is because:
- Web clients don't trigger `PlayerJoinEvent` (they're not actual players)
- The GUI only checked UDP connections via `UDPSocketManager.isPlayerConnected()`
- Web clients were tracked in `PlayerPositionTracker` but not reflected in GUI

### 2. Audio Not Working
Multiple potential causes:
- Web client audio data not being transmitted to the web UI
- Hardware devices may not be properly selected/detected
- Audio bridge not fully integrated with UDPSocketManager
- No audio payload in WebSocket messages from server to client

## Solutions Implemented

### 1. GUI Update (✅ FIXED)

#### Added WebRTC Client Listener
- `WebRTCSignalingServer` now has a `WebRTCClientListener` interface
- Callbacks: `onClientConnected()` and `onClientDisconnected()`
- Plugin registers listener to be notified of web client connections

#### GUI Detection
- `VoiceChatPage` now checks **both** UDP and WebRTC clients
- Updated `updateConnectionStatus()` to call:
  ```java
  plugin.getUdpServer().isPlayerConnected(playerRef.getUuid())  // UDP/Go client
  plugin.getWebRTCServer().isWebClientConnected(playerRef.getUuid())  // WebRTC/Web client
  ```
- Updated `refreshPage()` with same dual-check logic

#### API Additions
- `HytaleVoiceChatPlugin.getWebRTCServer()` - accessor for WebRTC server
- `WebRTCSignalingServer.isWebClientConnected(UUID)` - check if web client connected
- `WebRTCSignalingServer.getConnectedClients()` - get all connected web clients

### 2. Audio Issue (⚠️ REQUIRES USER TESTING)

#### What's Implemented
- Web client sends audio via JavaScript `AudioManager.processAudioInput()`
- Audio is captured from microphone (with echo cancellation, noise suppression, AGC)
- Audio forwarded via WebRTC data channel
- Server receives audio in `WebRTCClient.sendAudio()`
- Audio encoded as base64 in JSON message type "audio"
- `WebRTCAudioBridge` queues and routes audio to nearby clients

#### What Still Needs Work
1. **Server → Web Audio Routing**:
   - `WebRTCAudioBridge.receiveAudioFromUDP()` needs integration with `UDPSocketManager`
   - Currently `routeAudioToWebRTC()` sends audio via `WebRTCClient.sendAudio()`
   - Message format: `{"type":"audio","data":{"audio":"base64EncodedData"}}`

2. **Web Client Audio Decoding**:
   - Web client needs to listen for "audio" messages in `signaling.js`
   - Decode base64 to binary
   - Pass to `AudioManager.playAudio()`
   - Hardware device selection may need explicit speaker enumeration

3. **Hardware Device Selection**:
   - `AudioManager.initialize()` uses `getUserMedia()` with config
   - Doesn't explicitly select microphone/speaker devices
   - May need to enumerate devices and let user choose:
     ```javascript
     navigator.mediaDevices.enumerateDevices()
       .then(devices => {
         const audioInputs = devices.filter(d => d.kind === 'audioinput');
         const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
         // Show selection UI
       })
     ```

## Testing Checklist

### GUI Updates
- [ ] Go client connects → GUI shows "Voice Client - Connected" (existing)
- [ ] Web client authenticates → GUI shows "Voice Client - Connected" (NEW)
- [ ] Web client disconnects → GUI shows "Voice Client - Disconnected" (NEW)
- [ ] Switching between clients doesn't break GUI (NEW)

### Audio Testing  
- [ ] Microphone is detected and permissions granted
- [ ] Audio data flows from web client to server (check server logs)
- [ ] Web client receives audio from native clients (may not work yet)
- [ ] Check for echo, latency, quality issues
- [ ] Verify audio only routes to nearby players (30 blocks default)

### Hardware Issues
- [ ] Check browser DevTools → Application → getUserMedia logs
- [ ] Verify microphone permissions are granted
- [ ] Test with different audio input devices if available
- [ ] Check system audio output device is correctly selected
- [ ] Check volume levels aren't too low/high

## Remaining Tasks

### High Priority (Audio Routing)
1. Integrate `WebRTCAudioBridge.receiveAudioFromUDP()` with `UDPSocketManager`
2. Update `UDPSocketManager.handleAudio()` to call bridge
3. Add audio decoding in web client JavaScript
4. Test end-to-end audio flow: Go Client → Server → Web Client

### Medium Priority (Audio Quality)
1. Implement proper Opus audio encoding/decoding (currently raw PCM)
2. Add jitter buffer for smooth playback
3. Implement echo cancellation beyond browser default
4. Add voice activity detection (VAD) to reduce bandwidth

### Low Priority (UI/UX)
1. Add device selector UI in web client for microphone/speaker
2. Add volume control sliders
3. Show which clients are speaking (voice activity indicator)
4. Add latency/quality metrics display

## File Changes Summary

### Modified Files
- `HytaleVoiceChatPlugin.java` - Added WebRTC server getter
- `WebRTCSignalingServer.java` - Added listener, client query methods
- `VoiceChatPage.java` - Dual-check for UDP and WebRTC connections
- `WebRTCClient.java` - Audio sending capability

### New Files
- `WebRTCAudioBridge.java` - Audio routing between WebRTC and UDP

### No Changes Yet (but will need)
- `UDPSocketManager.java` - Bridge integration needed
- `web-client/js/signaling.js` - Audio message handling needed
- `web-client/js/audio.js` - Audio device selection + receiving needed
