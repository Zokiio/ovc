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
cd go-client
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
cd go-client
./HytaleVoiceChat
```
Connect both clients to the server.

**What's Working:**
- ✅ UDP server listening
- ✅ Client connection to server
- ✅ GUI controls functional
- ✅ Microphone capture and speaker playback

**What's NOT Implemented Yet:**
- ❌ Opus encoding/decoding
- ❌ Full Hytale plugin event integration

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

Copy to Hytale server:
```bash
./gradlew :hytale-plugin:build
# JAR automatically copied to /Users/zoki/hytale/server/mods/
```

### Next Steps to Make It Fully Functional

1. **Implement actual UDP transmission** - Connect microphone data to UDP packets
2. **Wire up Opus codec** - Encode audio before sending, decode on receive
3. **Integrate with Hytale events** - Hook player movement/position tracking
4. **Test with actual voice data** - Speak into mic, hear on other client
5. **Test proximity routing** - Move players in-game and verify audio range
