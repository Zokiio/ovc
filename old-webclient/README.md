# Voice Chat Web Client

Modern React-based WebRTC voice chat client with proximity-based audio and group management.

## Features

- **WebRTC Audio**: Browser-based voice chat with no installation required
- **Proximity Voice**: Spatial audio based on in-game player positions
- **Group Management**: Create and join voice groups for team coordination
- **Individual Volume Controls**: Adjust volume per user
- **Voice Activity Detection**: Real-time speaker indicators with environment presets
- **Modern UI**: Dark-themed interface built with React, Radix UI, and Tailwind CSS

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS v4 with Radix Colors
- **UI Components**: Radix UI primitives
- **Icons**: Phosphor Icons
- **Audio**: Web Audio API with WebRTC DataChannels
- **State Management**: React hooks and context

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Development

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm preview
```

### Environment Configuration

The client connects to the WebSocket signaling server. Update the server URL in your connection settings:

- **Development**: `ws://localhost:24455` (local plugin)
- **Production**: `wss://your-domain.com/voice` (reverse proxy recommended)

## Project Structure

```
webrt/
├── src/
│   ├── components/       # React components
│   │   ├── ui/          # Radix UI component wrappers
│   │   ├── ConnectionView.tsx
│   │   ├── GroupCard.tsx
│   │   └── ...
│   ├── hooks/           # Custom React hooks
│   │   ├── use-audio-transmission.ts
│   │   ├── use-voice-activity.ts
│   │   └── ...
│   ├── lib/             # Core logic
│   │   ├── audio-playback.ts
│   │   ├── signaling.ts
│   │   ├── types.ts
│   │   └── utils.ts
│   ├── App.tsx          # Main application component
│   └── main.tsx         # Application entry point
├── public/              # Static assets
│   ├── audio-capture-processor.js
│   └── audio-playback-processor.js
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Key Components

### ConnectionView
Main interface for connecting to the signaling server and configuring audio devices.

### GroupCard
Displays and manages voice groups with member lists and volume controls.

### AudioLevelMeter
Visual feedback for microphone input levels.

### VoiceActivityMonitor
Real-time voice activity detection with environment-specific calibration.

## Audio Pipeline

1. **Capture**: Microphone → AudioContext → AudioWorklet
2. **Processing**: Voice Activity Detection + Volume Analysis
3. **Transmission**: WebSocket signaling → WebRTC DataChannel → Server
4. **Reception**: Server → DataChannel → AudioWorklet → Output Device
5. **Playback**: Spatial audio mixing with per-user volume control

## Development Tips

### Hot Module Replacement
Vite provides fast HMR - changes reflect instantly during development.

### TypeScript
Type checking runs during build. Run `npm run build` to catch type errors.

### Linting
```bash
npm run lint
```

### Component Development
- UI components use Radix UI primitives (accessible, unstyled)
- Styling with Tailwind utility classes
- Dark theme by default (customizable via `next-themes`)

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 14.3+)

WebRTC DataChannels and Web Audio API required.

## Deployment

### Build

```bash
npm run build
```

Output in `dist/` directory - serve with any static web server or CDN.

### Serve with Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name voice.example.com;
    
    root /var/www/voice-client/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Environment Variables

No environment variables needed - server URL configured at runtime via UI.

## Troubleshooting

### Microphone Access Denied
- Check browser permissions (chrome://settings/content/microphone)
- HTTPS required for microphone access (except localhost)

### WebSocket Connection Failed
- Verify signaling server is running
- Check server URL and port
- Ensure CORS origins include your domain

### Audio Not Playing
- Check browser audio permissions
- Verify output device selection
- Check browser console for errors

## Related Documentation

- [Main README](../README.md) - Project overview
- [Configuration Guide](../HYTALE_CONFIGURATION.md) - Server configuration
- [Reverse Proxy Setup](../REVERSE_PROXY_SETUP.md) - Production deployment
