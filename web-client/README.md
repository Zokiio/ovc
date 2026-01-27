# Hytale Voice Chat - Web Client

Browser-based voice chat client using WebRTC for the Hytale Voice Chat system.

## Features

- 🌐 **Browser-based**: No downloads or installations required
- 🔒 **Secure**: WebRTC with DTLS-SRTP encryption
- 🎙️ **Real-time audio**: Low-latency voice communication
- 📡 **Proximity-based**: Same spatial audio as native client
- 💻 **Cross-platform**: Works on any modern browser

## Quick Start

### For Players

1. Open `index.html` in your web browser
2. Enter your Hytale username
3. Enter the server address (e.g., `hytale.server.com`)
4. Click "Connect"
5. Allow microphone access when prompted
6. Start talking!

### Hosting the Web Client

#### Option 1: Static File Server
```bash
# Using Python
cd web-client
python3 -m http.server 8080

# Using Node.js
npx serve -p 8080

# Using Go
go run -m http.server -addr :8080
```

Then open: http://localhost:8080

#### Option 2: Web Server (Apache/Nginx)
Copy the `web-client` directory to your web server's document root.

**Important**: For production use, serve over HTTPS. Some browsers require HTTPS for microphone access.

## Browser Compatibility

### Supported Browsers
- ✅ Chrome/Edge 74+
- ✅ Firefox 66+
- ✅ Safari 12+ (requires HTTPS)
- ✅ Opera 62+

### Required Browser Features
- WebRTC (RTCPeerConnection)
- Web Audio API (AudioContext)
- WebSocket
- MediaDevices.getUserMedia()

## Configuration

### Server Connection
Edit `js/config.js` to set default server settings:

```javascript
const DEFAULT_SERVER_HOST = 'localhost';
const DEFAULT_SIGNALING_PORT = 24455;
const STUN_SERVERS = ['stun:stun.l.google.com:19302'];
```

### Audio Settings
Default audio configuration:
- **Codec**: Opus (48kHz, mono)
- **Frame Duration**: 20ms
- **Bitrate**: Adaptive (WebRTC auto-adjusts)

## Architecture

```
┌─────────────────────────────────────┐
│     Web Browser (Web Client)        │
│  ┌──────────────────────────────┐   │
│  │   HTML5 UI                   │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │   WebRTC PeerConnection      │   │
│  │   (Audio Capture/Playback)   │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │   WebSocket Client           │   │
│  │   (Signaling)                │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
                 │
                 │ WebSocket (ws://server:24455)
                 │ WebRTC (DTLS-SRTP)
                 ▼
┌─────────────────────────────────────┐
│   Hytale Server Plugin              │
│  ┌──────────────────────────────┐   │
│  │   WebSocket Signaling Server │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │   WebRTC Audio Bridge        │   │
│  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐   │
│  │   Voice Router               │   │
│  │   (Proximity-based)          │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

## Files

- `index.html` - Main web page
- `css/style.css` - Styling
- `js/config.js` - Configuration constants
- `js/signaling.js` - WebSocket signaling client
- `js/webrtc.js` - WebRTC connection manager
- `js/audio.js` - Audio capture and playback
- `js/ui.js` - UI event handlers
- `js/main.js` - Application entry point

## Development

### Testing Locally

1. Start the Hytale server with the voice chat plugin
2. Ensure the WebSocket signaling server is running (port 24455)
3. Serve the web client files (see hosting options above)
4. Open the web client in your browser
5. Connect to `localhost:24455`

### Debugging

Open browser DevTools (F12) and check:
- **Console**: JavaScript errors and log messages
- **Network**: WebSocket connection status
- **Application > WebRTC Internals**: Detailed WebRTC stats (chrome://webrtc-internals)

## Security Notes

### HTTPS Requirement
Modern browsers require HTTPS for:
- Microphone access (getUserMedia)
- Secure contexts in general

For development, localhost is exempt from this requirement.

For production:
- Use HTTPS (TLS/SSL certificate)
- Or use a reverse proxy (Nginx, Apache) with HTTPS

### Content Security Policy
If you host the web client with CSP headers, ensure:
- `connect-src` allows WebSocket connections to your server
- `media-src` allows microphone access
- `script-src` allows inline scripts (or use nonces/hashes)

## Troubleshooting

### Microphone not working
- Check browser permissions
- Ensure HTTPS (or localhost)
- Check for browser errors in DevTools

### Connection fails
- Verify server address and port
- Check firewall settings
- Ensure WebSocket server is running on port 24455
- Check browser console for WebSocket errors

### Audio not heard
- Check speaker/headphone volume
- Verify WebRTC connection is established
- Check browser DevTools > WebRTC Internals for connection stats
- Ensure other players are within proximity range

### Poor audio quality
- Check network connection
- Look for packet loss in WebRTC stats
- Try connecting to a closer server
- Check for browser performance issues

## Future Enhancements

- [ ] Volume controls per player
- [ ] Push-to-talk option
- [ ] Visual indicators for speaking players
- [ ] Proximity visualization on 2D map

## License

Part of the Hytale Voice Chat project.
