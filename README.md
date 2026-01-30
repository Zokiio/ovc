![Hytale Voice Chat Logo](.github/images/logo.png)

# Hytale Voice Chat

Proximity-based voice chat system for Hytale with WebRTC technology:

- **Web Client**: Browser-based WebRTC client (no installation required)
- **Hytale Plugin**: Server-side SFU (Selective Forwarding Unit) for media routing written in Java

---

## 🌐 Web Client

The web client is a **browser-based voice chat interface** that requires no installation. Uses WebRTC for peer connections with server-side selective forwarding.

### Features

- No installation required - runs directly in your browser
- WebRTC DataChannels with Opus codec for high-quality audio
- Built-in DTLS-SRTP encryption
- Cross-platform (any modern browser: Chrome, Firefox, Safari)
- Proximity-based spatial audio
- Microphone capture and audio playback via Web Audio API

### Quick Start

```bash
cd web-client

# Serve files with any static web server
python3 -m http.server 8080

# Then open http://localhost:8080 in your browser
```

**📖 Full documentation:** [`web-client/README.md`](web-client/README.md)

---

## 🔌 Hytale Plugin

The Java plugin runs **inside the Hytale server** and acts as a WebRTC SFU (Selective Forwarding Unit) for media routing based on player proximity.

### Features

- Ice4j-based WebRTC peer connection handling
- DataChannel media routing for web clients
- Proximity-based audio routing (configurable range, default 30 blocks)
- Player position tracking via Hytale API
- Authentication and session management
- STUN/TURN server support for NAT traversal
- In-game GUI for voice settings and group management

![Voice Chat GUI](.github/images/voicechat-gui.png)

### Quick Start

```bash
cd hytale-plugin
./gradlew build

# Plugin JAR will be in: build/libs/
# Copy to your Hytale server's mods/ folder
```

**📖 Full documentation:** [`hytale-plugin/docs/SETUP.md`](hytale-plugin/docs/SETUP.md)

---

## 📂 Project Structure

```text
hytale-voice-chat/
├── web-client/            # Browser-based WebRTC client
│   ├── js/                # JavaScript modules
│   ├── css/               # Stylesheets
│   ├── index.html         # Main web page
│   └── README.md          # Web client documentation
│
├── hytale-plugin/         # Java server plugin (WebRTC SFU)
│   ├── src/               # Plugin source code
│   ├── common/            # Shared Java models
│   ├── docs/              # Plugin documentation
│   ├── build.gradle       # Build configuration
│   └── gradlew            # Gradle wrapper
│
├── docs/                  # Architecture documentation
│   └── WEBRTC_ARCHITECTURE.md  # WebRTC design docs
│
├── .gitignore
└── README.md              # This file
```

---

## 🚀 Getting Started

### For Players (Client Setup)

**Web Browser Client**

1. Navigate to the hosted web client URL (provided by your server admin)
2. Enter your Hytale username
3. Enter the server address (e.g., `hytale.techynoodle.com`)
4. Click "Connect" and allow microphone access when prompted
5. Start talking - players within proximity will hear you!

See [`web-client/README.md`](web-client/README.md) for detailed instructions.

### For Server Admins (Plugin Setup)

1. Build the plugin:

   ```bash
   cd hytale-plugin
   ./gradlew build
   ```
  
2. Copy JAR from `hytale-plugin/build/libs/` to your Hytale server's `mods/` folder
3. Start/restart the Hytale server
4. Configure settings in `config/voicechat.yml` (if needed)

**Keeping Updated:** The plugin uses the Hytale Server API from Maven. To check for and update to new API versions, run `hytale-plugin/check-hytale-version.ps1` or edit `hytale_server_version` in `hytale-plugin/gradle.properties`. See [`hytale-plugin/docs/HYTALE_VERSION_MANAGEMENT.md`](hytale-plugin/docs/HYTALE_VERSION_MANAGEMENT.md) for details.

See [`hytale-plugin/docs/SETUP.md`](hytale-plugin/docs/SETUP.md) for detailed instructions.

---

## 📚 Documentation

- **Web Client**: See [`web-client/README.md`](web-client/README.md)
- **Hytale Plugin**: See [`hytale-plugin/docs/`](hytale-plugin/docs/) directory for detailed guides:
  - [Setup Guide](hytale-plugin/docs/SETUP.md)
  - [Testing Guide](hytale-plugin/docs/TEST.md)
  - [WebRTC Architecture](docs/WEBRTC_ARCHITECTURE.md)

---

## 🛠️ Development

### Prerequisites

- **Web Client**: Node.js 18+, npm (for development server and build tools)
- **Hytale Plugin**: Java 25, Gradle (no local Hytale API files needed - uses Maven)

### Building

```bash
# Build Java plugin
cd hytale-plugin && ./gradlew build

# Develop web client (with hot reload)
cd web-client && npm install && npm run dev
```

---

## 📝 License

This project is for educational/personal use with Hytale.
