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

1. Open the web client URL (provided by your server admin)
2. Enter your Hytale username
3. Enter the server address (e.g., `hytale.server.com`)
4. Click "Connect"
5. Allow microphone access when prompted
6. Start talking!

### Development Setup

```bash
# Install dependencies
cd web-client
npm install

# Start development server (with HTTPS for getUserMedia)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The dev server will start on https://localhost:8000 with automatic browser opening and hot module replacement.

**Note**: The dev server uses a self-signed certificate. Your browser will show a security warning - click "Advanced" and "Proceed to localhost" to continue.

### Hosting the Web Client

#### Development
Use Vite's built-in dev server (see above) - includes HTTPS and hot reload.

#### Production
```bash
# Build optimized production files
npm run build

# Output will be in dist/ directory
# Deploy dist/ to your web server
```

**Important**: Serve over HTTPS. Some browsers require HTTPS for microphone access.

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

### Source Files
- `index.html` - Main web page
- `css/style.css` - Styling
- `js/config.js` - Configuration constants (ES module)
- `js/signaling.js` - WebSocket signaling client (ES module)
- `js/webrtc.js` - WebRTC connection manager (ES module)
- `js/audio.js` - Audio capture and playback (ES module)
- `js/ui.js` - UI event handlers (ES module)
- `js/main.js` - Application entry point (ES module)

### Build Files
- `package.json` - NPM dependencies and scripts
- `vite.config.js` - Vite configuration with HTTPS support
- `dist/` - Production build output (generated by `npm run build`)

## Development

### Testing Locally

1. Start the Hytale server with the voice chat plugin
2. Ensure the WebSocket signaling server is running (port 24455)
3. Run `npm run dev` to start the Vite dev server
4. Browser will open automatically to https://localhost:8000
5. Accept the self-signed certificate warning
6. Connect to your server address

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
