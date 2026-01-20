# Hytale Voice Chat

Proximity-based voice chat system for Hytale with two independent components:
- **Go Client**: Lightweight desktop voice client
- **Java Plugin**: Server-side plugin with integrated UDP voice server

---

## 🎮 Go Voice Client

The Go client is a **standalone desktop application** that players install on their computers to enable voice chat.

### Features
- Cross-platform GUI (Windows, macOS, Linux)
- Built with Go + Fyne UI framework
- Microphone capture and audio playback using PortAudio
- UDP-based communication with the server
- No Java installation required

### Quick Start
```bash
cd go-client
go build -o HytaleVoiceChat ./cmd/voice-client
./HytaleVoiceChat
```

**📖 Full documentation:** [`go-client/README.md`](go-client/README.md)

---

## 🔌 Hytale Server Plugin

The Java plugin runs **inside the Hytale server** and handles voice routing based on player proximity.

### Features
- Netty-based UDP server for voice packets
- Proximity-based audio routing (configurable range)
- Player position tracking via Hytale API
- Authentication and session management

### Quick Start
```bash
# Build the plugin
./gradlew :hytale-plugin:build

# Plugin JAR will be in: hytale-plugin/build/libs/
# Copy to your Hytale server's mods/ folder
```

**📖 Full documentation:** [`docs/SETUP.md`](docs/SETUP.md)

---

## 📂 Project Structure

```
hytale-voice-chat/
├── go-client/             # Go desktop client (standalone app)
│   ├── cmd/               # CLI entry points
│   ├── internal/          # Go client implementation
│   └── README.md          # Go client documentation
│
├── hytale-plugin/         # Java server plugin
│   ├── src/               # Plugin source code
│   └── build.gradle       # Plugin build configuration
│
├── common/                # Shared Java models (used by plugin)
│   └── src/               # Packet formats, data models
│
├── docs/                  # Java plugin documentation
│   ├── SETUP.md           # Installation and configuration
│   ├── AUDIO_TESTING.md   # Audio testing guide
│   ├── AUTHENTICATION.md  # Authentication flow
│   ├── TEST.md            # Testing procedures
│   └── TEST_SCENARIOS.md  # Detailed test scenarios
│
├── build.gradle           # Root Gradle configuration
└── README.md              # This file
```

---

## 🚀 Getting Started

### For Players (Client Setup)
1. Download the Go client for your platform
2. Run `HytaleVoiceChat` executable
3. Enter your Hytale username and server address
4. Click "Connect" and start talking!

See [`go-client/README.md`](go-client/README.md) for detailed instructions.

### For Server Admins (Plugin Setup)
1. Build the plugin: `./gradlew :hytale-plugin:build`
2. Copy JAR to your Hytale server's `mods/` folder
3. Start/restart the Hytale server
4. Configure settings in `config/voicechat.yml` (if needed)

See [`docs/SETUP.md`](docs/SETUP.md) for detailed instructions.

---

## 📚 Documentation

- **Go Client**: See [`go-client/README.md`](go-client/README.md)
- **Java Plugin**: See [`docs/`](docs/) directory for detailed guides:
  - [Setup Guide](docs/SETUP.md)
  - [Testing Guide](docs/TEST.md)
  - [Audio Testing](docs/AUDIO_TESTING.md)
  - [Authentication Flow](docs/AUTHENTICATION.md)
  - [Test Scenarios](docs/TEST_SCENARIOS.md)

---

## 🛠️ Development

### Prerequisites
- **Go Client**: Go 1.23+, PortAudio
- **Java Plugin**: Java 25+, Gradle 8+, Hytale Server API files

### Building Both Components
```bash
# Build Java plugin
./gradlew :hytale-plugin:build

# Build Go client
cd go-client && go build -o HytaleVoiceChat ./cmd/voice-client
```

---

## 📝 License

This project is for educational/personal use with Hytale.