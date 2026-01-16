# Testing Hytale Voice Chat

## Quick Test Guide

### 1. Start the Voice Server
```bash
./gradlew :voice-server:run
```
**Expected:** Server logs "Starting voice server on port 24454"

### 2. Check Server is Listening
```bash
lsof -i :24454
```
**Expected:** Shows java process listening on port 24454

### 3. Start Voice Client #1
```bash
./gradlew :voice-client:run
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
- Click **Test Microphone** button
- **Expected:** Shows dialog with Client ID

### 6. Test Multiple Clients (Full Test)
Open another terminal and start a second client:
```bash
./gradlew :voice-client:run
```
Connect both clients to the server.

**What's Working:**
- ✅ UDP server listening
- ✅ Client connection to server
- ✅ GUI controls functional
- ✅ Microphone manager initialized
- ✅ Speaker manager initialized

**What's NOT Implemented Yet:**
- ❌ Actual UDP packet transmission
- ❌ Opus encoding/decoding
- ❌ Real microphone audio capture
- ❌ Audio playback
- ❌ Proximity-based routing
- ❌ REST API in voice server
- ❌ Hytale plugin integration

### 7. Check Logs

**Voice Server Terminal:**
Look for:
```
INFO com.hytale.voicechat.server.VoiceServer -- Starting voice server on port 24454
INFO com.hytale.voicechat.server.network.UDPSocketManager -- UDP socket listening on port 24454
```

**Voice Client Terminal:**
Look for:
```
INFO com.hytale.voicechat.client.VoiceChatClient -- Connecting to voice server at localhost:24454
INFO com.hytale.voicechat.client.audio.MicrophoneManager -- Microphone started
INFO com.hytale.voicechat.client.audio.SpeakerManager -- OpenAL audio playback started
INFO com.hytale.voicechat.client.VoiceChatClient -- Connected to voice server successfully
```

### 8. Test Hytale Plugin

Copy to Hytale server:
```bash
./gradlew :hytale-plugin:build
# JAR automatically copied to /Users/zoki/hytale/server/mods/
```

Start Hytale server and check for plugin loading.

### Next Steps to Make It Fully Functional

1. **Implement actual UDP transmission** - Connect microphone data to UDP packets
2. **Wire up Opus codec** - Encode audio before sending, decode on receive
3. **Implement packet routing** - Server routes packets based on player proximity
4. **Add REST API to voice server** - Endpoint for receiving player positions
5. **Connect Hytale plugin** - Send player positions to voice server API
6. **Test with actual voice data** - Speak into mic, hear on other client
