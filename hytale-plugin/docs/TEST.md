# Testing Hytale Voice Chat

## Quick Test Guide

### 1. Start the Hytale Server with Plugin
Place the plugin in your Hytale server's mods folder and start the server:
```bash
# Plugin auto-copies via: ./gradlew :hytale-plugin:build
# Then start your Hytale server
```
**Expected:** Server logs "UDP socket listening on port 24454"

### 2. Check Server is Listening
```bash
lsof -i :24454
```
**Expected:** Shows java process listening on port 24454

### 3. Start Voice Client #1
```bash
cd voice-client
go build -o HytaleVoiceChat ./cmd/voice-client
./HytaleVoiceChat
```
**Expected:** GUI window opens with "Disconnected" status

### 4. Test Connection
In the GUI:
- Enter server address: `localhost`
- Enter port: `24454`
- Click **Connect**

**Expected:** 
- Button changes to "Disconnect"
- Status shows green "Connected to localhost:24454"
- Console logs: "Connected to voice server successfully"

### 5. Test Microphone
- Click **Send Test Tone**
- **Expected:** Other client hears a short tone

### 6. Test Multiple Clients (Full Test)
Open another terminal and start a second client:
```bash
cd voice-client
./HytaleVoiceChat
```
Connect both clients to the server.

**What's Working:**
- ✅ UDP server listening
- ✅ Client connection to server
- ✅ GUI controls functional
- ✅ Microphone capture and speaker playback
- ✅ Opus encoding/decoding
- ✅ Real-time audio streaming (48kHz, 16-bit, mono)
- ✅ Full-duplex communication

**What's NOT Fully Implemented Yet:**
- ⚠️ Hytale plugin event integration (player positions, join/quit events)
- ⚠️ Voice Activity Detection (VAD)
- ⚠️ 3D positional audio

### 7. Check Logs

**Hytale Server Terminal:**
Look for:
```
INFO com.hytale.voicechat.plugin.HytaleVoiceChatPlugin -- Hytale Voice Chat Plugin enabled
INFO com.hytale.voicechat.plugin.network.UDPSocketManager -- UDP socket listening on port 24454
```

**Voice Client Terminal:**
Look for:
```
Connecting to voice server at localhost:24454 as user '...'
Received authentication acknowledgment: Authentication accepted
Audio manager initialized (PCM audio codec ready, input: ...)
```

### 8. Test Hytale Plugin

Build and copy to Hytale server:
```bash
./gradlew build
# Copy JAR from build/libs/ to your Hytale server's mods/ directory
```

### Next Steps to Make It Fully Functional

1. ✅ **Implement actual UDP transmission** - Done
2. ✅ **Wire up Opus codec** - Done (both encoding and decoding)
3. **Integrate with Hytale events** - Hook player movement/position tracking (in progress)
4. ✅ **Test with actual voice data** - Done (working audio streaming)
5. **Test proximity routing** - Needs player positions from Hytale API
6. **Add Voice Activity Detection** - Reduce bandwidth when not speaking
7. **Implement 3D positional audio** - Spatial audio based on player positions
