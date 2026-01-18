# Audio Streaming Test Guide

## Current Implementation Status

✅ **Working:**
- Username-based authentication
- Real-time audio capture from microphone (48kHz, 16-bit, mono)
- UDP packet transmission with sequence numbers
- Audio reception and playback
- Full-duplex streaming (simultaneous send/receive)
- Proximity-based routing on server (30 block range)

⚠️ **Not Yet Implemented:**
- Opus codec compression (sending raw PCM - high bandwidth!)
- OpenAL 3D positional audio
- Actual Hytale player event hooks
- Voice Activity Detection (always transmitting)

## Testing Locally

### 1. Start the Plugin (Server)
```bash
# Build and copy to Hytale server
./gradlew :hytale-plugin:build

# The plugin JAR is auto-copied to:
# /Users/zoki/hytale/server/mods/hytale-plugin-1.0.0-SNAPSHOT.jar

# Start Hytale server
# Plugin will log: "UDP socket listening on port 24454"
```

### 2. Test with Two Voice Clients

**Terminal 1 - Start Client #1:**
```bash
cd go-client
go build -o HytaleVoiceChat ./cmd/voice-client
./HytaleVoiceChat
```
- Username: `Alice`
- Server: `localhost`
- Port: `24454`
- Click **Connect**

**Terminal 2 - Start Client #2:**
```bash
cd go-client
./HytaleVoiceChat
```
- Username: `Bob`
- Server: `localhost`
- Port: `24454`
- Click **Connect**

### 3. Expected Behavior

**Authentication:**
```
Server logs:
  INFO: Client authenticated: Alice (client UUID: xxx, player UUID: null) from 127.0.0.1:xxxxx
  INFO: Client authenticated: Bob (client UUID: yyy, player UUID: null) from 127.0.0.1:yyyyy
```

**Audio Streaming:**
- Speak into Alice's microphone → Bob should hear it
- Speak into Bob's microphone → Alice should hear it
- Audio plays through speakers in near real-time
- Server routes packets between clients

**Server Routing:**
```
DEBUG: Routed audio from Alice to 1 nearby players
```

### 4. What You Should Hear

- **Without Hytale integration:** All clients hear each other (broadcast mode)
- **With player positions:** Only clients within 30 blocks hear each other
- **Audio quality:** Raw PCM (uncompressed) - clear but uses ~1.5 Mbps bandwidth
- **Latency:** ~20-50ms depending on network

### 5. Troubleshooting

**No audio received:**
- Check firewall allows UDP port 24454
- Verify microphone permissions
- Check speaker/microphone in system settings
- Look for errors in the client log file (`client.log`)

**Audio choppy/distorted:**
- CPU too high? Check with Activity Monitor
- Network congestion? Run `ping localhost`
- Buffer underrun? Check logs for dropped frames

**Client can't authenticate:**
- Server must be running first
- Check port 24454 is not in use: `lsof -i :24454`
- Verify server address is correct

**Player UUID is null:**
- Expected! Hytale API integration not yet complete
- Server falls back to broadcasting to all clients
- Will work once Hytale events are hooked up

## Network Analysis

**Bandwidth per client (uncompressed PCM):**
- Sample rate: 48000 Hz
- Bit depth: 16 bits = 2 bytes
- Channels: 1 (mono)
- **Bandwidth:** 48000 × 2 = 96,000 bytes/sec ≈ 768 Kbps

**With Opus codec (future):**
- Typical voice: 24-32 Kbps
- High quality: 48-64 Kbps
- **Bandwidth reduction:** ~12-32x smaller

## Current Limitations

1. **No compression:** Using ~768 Kbps per client
2. **No VAD:** Always transmitting (even silence)
3. **No echo cancellation:** May hear yourself through other clients
4. **Mono only:** No stereo or 3D positioning yet
5. **No packet loss recovery:** Lost packets = audio gaps
6. **Fixed 30-block range:** Not configurable yet

## Next Steps for Testing

1. **Add Opus codec:**
   - Reduce bandwidth to 24-48 Kbps
   - Better for real network conditions
   
2. **Mock player positions:**
   - Manually set positions to test proximity routing
   - Verify 30-block range calculation
   
3. **Stress test:**
   - Connect 5-10 clients
   - Measure CPU and bandwidth usage
   - Test packet loss handling

4. **Integrate with Hytale:**
   - Add real player join/quit events
   - Hook player movement for position updates
   - Test with players in different worlds

## Success Criteria

- ✅ Two clients can talk to each other
- ✅ Audio is clear and real-time
- ✅ Authentication works (username linking)
- ✅ Server routes packets correctly
- ⏳ Opus codec reduces bandwidth
- ⏳ 3D audio positions players in space
- ⏳ Only players within 30 blocks hear each other

## Example Test Session

```
[Alice] Connect to server
  → Server: "Client authenticated: Alice"
  → Start microphone capture
  → Start transmitting audio

[Bob] Connect to server
  → Server: "Client authenticated: Bob"
  → Start microphone capture
  → Start transmitting audio

[Alice] Say "Hello Bob"
  → Microphone captures audio
  → Client creates AudioPacket
  → Client sends UDP to server
  → Server receives packet
  → Server routes to Bob (proximity check)
  → Bob receives UDP packet
  → Bob deserializes AudioPacket
  → Bob plays audio through speakers
  → Bob hears "Hello Bob"

[Bob] Say "Hi Alice"
  → Same flow in reverse
  → Alice hears "Hi Alice"
```

## Performance Monitoring

```bash
# Check CPU usage
top | grep java

# Check network traffic
nettop -p 24454

# Check packet drops
netstat -su | grep dropped

# Monitor plugin logs
tail -f hytale-server/logs/latest.log | grep VoiceChat
```
