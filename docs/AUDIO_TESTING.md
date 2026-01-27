# Audio Testing Guide for Hytale Voice Chat

## Prerequisites
- Plugin JAR built and deployed to Hytale server
- Web client running on localhost:8080 (or configured server)
- Go client (optional, for testing UDP side)
- Server logs accessible to monitor audio flow

## Testing Procedure

### Step 1: Start Server and Connect Web Client
1. Deploy plugin to Hytale server
2. Check logs for: `[WebRTCSignalingServer] WebRTC signaling server started on port 24455`
3. Open web client: http://localhost:8080
4. Enter username and click "Connect"
5. Check logs for: `[WebRTCSignalingServer] Added WebRTC client to position tracker: [username]`

### Step 2: Verify Audio Capture
1. On web client page, browser should request microphone permission
2. **Grant permission** when prompted
3. Speak into microphone
4. Watch browser console (F12 → Console) for any errors
5. Server logs should show: `AUDIO TEST: Received [N] bytes from WebRTC client: [UUID]`

### What to Look For in Logs

#### Successful Audio Flow:
```
[AUDIO TEST: Audio processing thread started]
[AUDIO TEST: Received 960 bytes from WebRTC client: [UUID]]
[AUDIO TEST: Queued audio frame for processing]
[AUDIO TEST: Processing audio frame of 960 bytes from [UUID]]
[AUDIO TEST: Sender at position (0, 0, 0)]
[AUDIO TEST: Routing to UDP clients]
[AUDIO TEST: Routing to nearby WebRTC clients]
[AUDIO TEST: Checking [N] WebRTC clients for proximity]
[AUDIO TEST: WebRTC client [username] at distance [D] blocks]
[AUDIO TEST: Sending audio to WebRTC client: [username]]
[AUDIO TEST: Successfully sent audio to: [username]]
```

#### Common Issues and Diagnostics:

**No Audio Received ("Received X bytes" not appearing)**
- ✓ Microphone permission granted? (Check browser permissions)
- ✓ Audio device working? (Test in another app)
- ✓ JavaScript capturing audio? (Check browser console for errors)
- ✓ Fix: May need to check `AudioManager.initialize()` in web client

**Audio Received But Not Routed ("Checking N WebRTC clients" = 0)**
- ✓ Is second web client connected? (Need 2+ clients to test)
- ✓ Clients in same world? (Both should be "overworld")
- ✓ Distance > 30 blocks? (Default proximity)
- ✓ Fix: Connect second web client, position closer than 30 blocks

**Audio Received But Distance Wrong**
- Position shows (0, 0, 0) for all web clients
- This is expected - web clients use default position
- UDP/Go clients will show real positions when they join game
- To test proximity: Connect both as web clients, modify position via debug

### Step 3: Test with Two Clients
1. Open second web client tab: http://localhost:8080?user=player2
2. First client connects as "player1"
3. Second client connects as "player2"
4. Have player1 speak - logs should show:
   ```
   [AUDIO TEST: WebRTC client player2 at distance 0 blocks]
   [AUDIO TEST: Sending audio to WebRTC client: player2]
   ```

### Step 4: Check Web Client Receives Audio
1. Need to verify web client's JavaScript receives audio messages
2. Open browser console (F12) on player2's client
3. Check for audio message handling in `signaling.js`
4. Should see: `Received audio message: [data]` or similar
5. If no message received, audio isn't being routed back to web client

### Server Log Locations
- **Windows**: Check Hytale server console or log files
- **Linux/Mac**: Usually in server output or `/path/to/hytale/logs/`
- **Docker**: `docker logs [container_name]` | grep "AUDIO TEST"

## Audio Quality Testing (After Basic Test Works)

### Latency Check
1. Note server timestamp when audio sent
2. Check client-side timestamp when received
3. Calculate latency = received - sent
4. Expected: < 50ms for local testing

### Audio Clarity
1. Record audio on receiver side
2. Listen for:
   - Clear voice (not robotic/distorted)
   - Proper volume (not too loud/quiet)
   - No excessive echo
   - No significant delay

### Multiple Clients
1. Connect 3+ web clients
2. One client speaks
3. Verify other clients receive audio
4. Check logs for all proximity calculations

## Debugging Tips

### Enable More Verbose Logging
In WebRTCAudioBridge, all "AUDIO TEST" logs are already enabled. For additional debugging:
- Look for "AUDIO TEST:" prefix in logs
- Search for client UUID to trace single client
- Search for "distance" to see proximity calculations

### Check Audio Data Format
- Audio should be 960 bytes per frame (20ms at 48kHz)
- If different size, may indicate encoding/capture issue
- Look for consistent frame sizes in logs

### Network Issues
- If audio sent but not received on other client:
  - Check WebSocket connection is active
  - Verify firewall allows port 24455
  - Check for network errors in browser console

### Browser Issues
- Try different browser (Chrome, Firefox, Safari)
- Clear browser cache and reload
- Check console for JavaScript errors
- Verify getUserMedia permissions

## Testing Checklist

- [ ] Server starts without errors
- [ ] Web client connects and shows "Voice Client - Connected"
- [ ] Browser requests and grants microphone permission
- [ ] Server logs show audio received: "AUDIO TEST: Received X bytes"
- [ ] Second web client can connect
- [ ] Audio routing logs show proximity check: "at distance X blocks"
- [ ] Audio reaches other clients (may not play yet if receiver not implemented)
- [ ] No error messages in logs or browser console
- [ ] Logs show consistent audio frame sizes (960 bytes)

## What's Not Yet Implemented

These will be needed for full audio:
- ✗ Web client JavaScript to decode audio messages
- ✗ Audio playback from received audio (AudioManager.playAudio)
- ✗ Audio from UDP clients routed to WebRTC clients
- ✗ Audio device selection UI
- ✗ Opus encoding/decoding (currently raw PCM)

## Next Steps After Basic Testing

Once audio flows through the server:
1. Implement audio message handling in web client JavaScript
2. Add audio playback using Web Audio API
3. Integrate UDP → WebRTC audio routing in UDPSocketManager
4. Add device selection for microphone/speaker
5. Implement proper Opus audio encoding/decoding
