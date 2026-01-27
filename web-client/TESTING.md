# Testing the Web Client Locally

## Quick Start

1. **Start a local web server** in the `web-client` directory:

   ```bash
   # Using Python 3
   cd web-client
   python3 -m http.server 8080
   ```

   Or using Node.js:
   ```bash
   npx serve -p 8080
   ```

2. **Open in browser**: Navigate to `http://localhost:8080`

3. **Test without server** (UI only):
   - Enter a username: `TestUser`
   - Enter server address: `localhost`
   - Click Connect (will fail gracefully if no server is running)

## Testing with Hytale Server

1. **Build and start the Hytale plugin**:
   ```bash
   cd hytale-plugin
   ./gradlew build
   # Copy JAR to your Hytale server's mods folder
   # Start the Hytale server
   ```

2. **Verify ports are open**:
   - UDP port 24454 (native clients)
   - WebSocket port 24455 (web clients)

3. **Connect from web client**:
   - Open http://localhost:8080
   - Enter your Hytale username
   - Enter server address (e.g., `localhost` or `192.168.1.100`)
   - Allow microphone access when prompted
   - Click Connect

## Browser DevTools

Press F12 to open DevTools and check:

1. **Console tab**: See connection logs and debug messages
2. **Network tab**: Verify WebSocket connection to `ws://server:24455/voice`
3. **Application tab**: Check for any errors

## Troubleshooting

### "Microphone access denied"
- Check browser permissions
- On HTTPS sites, ensure certificate is valid
- On localhost, microphone should work without HTTPS

### "WebSocket connection failed"
- Verify the Hytale server is running with the voice chat plugin
- Check that port 24455 is not blocked by firewall
- Verify the server address is correct

### "No audio"
- Check speaker/headphone volume
- Verify WebRTC connection in DevTools
- Ensure you're within proximity range (30 blocks) of other players

## Known Limitations

The current implementation is a **proof of concept**:

1. **SDP Exchange**: Uses placeholder SDP - needs WebRTC library
2. **Audio Format**: Simplified - needs proper Opus codec integration
3. **ICE Candidates**: Logged but not fully processed
4. **Audio Bridge**: Not yet integrated with UDP voice routing

## Next Steps for Full Implementation

1. Add WebRTC library (e.g., webrtc-java) to handle SDP/ICE properly
2. Implement audio transcoding between WebRTC and UDP formats
3. Integrate with proximity-based routing
4. Add comprehensive error handling
5. Optimize audio quality and latency
