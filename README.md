# Hytale Voice Chat

Proximity-based voice chat system for Hytale with two independent components:
- **Voice Client**: Lightweight desktop voice client written in Go
- **Hytale Plugin**: Server-side plugin with integrated UDP voice server written in Java

---

## 🎮 Voice Client

The voice client is a **standalone desktop application** that players install on their computers to enable voice chat.

### Features
- Cross-platform GUI (Windows, macOS, Linux)
- Built with Go + Fyne UI framework
- Microphone capture and audio playback using PortAudio
- UDP-based communication with the server
- No Java installation required

### Quick Start
```bash
cd voice-client
go build -o HytaleVoiceChat ./cmd/voice-client
./HytaleVoiceChat
```

**📖 Full documentation:** [`voice-client/README.md`](voice-client/README.md)

---

## 🔌 Hytale Plugin

The Java plugin runs **inside the Hytale server** and handles voice routing based on player proximity.

### Features
- Netty-based UDP server for voice packets
- Proximity-based audio routing (configurable range)
- Player position tracking via Hytale API
- Authentication and session management

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

```
hytale-voice-chat/
├── voice-client/          # Go desktop client (standalone app)
│   ├── cmd/               # CLI entry points
│   ├── internal/          # Go client implementation
│   └── README.md          # Go client documentation
│
├── hytale-plugin/         # Java server plugin
│   ├── src/               # Plugin source code
│   ├── common/            # Shared Java models
│   ├── docs/              # Plugin documentation
│   ├── build.gradle       # Build configuration
│   └── gradlew            # Gradle wrapper
│
├── .gitignore
└── README.md              # This file
```

---

## 🚀 Getting Started

### For Players (Client Setup)
1. Download the voice client for your platform
2. Run `HytaleVoiceChat` executable
3. Enter your Hytale username and server address
4. Click "Connect" and start talking!

See [`voice-client/README.md`](voice-client/README.md) for detailed instructions.

### For Server Admins (Plugin Setup)
1. Build the plugin:
   ```bash
   cd hytale-plugin
   ./gradlew build
   ```
2. Copy JAR from `hytale-plugin/build/libs/` to your Hytale server's `mods/` folder
3. Start/restart the Hytale server
4. Configure settings in `config/voicechat.yml` (if needed)

See [`hytale-plugin/docs/SETUP.md`](hytale-plugin/docs/SETUP.md) for detailed instructions.

---

## 📚 Documentation

- **Voice Client**: See [`voice-client/README.md`](voice-client/README.md)
- **Hytale Plugin**: See [`hytale-plugin/docs/`](hytale-plugin/docs/) directory for detailed guides:
  - [Setup Guide](hytale-plugin/docs/SETUP.md)
  - [Testing Guide](hytale-plugin/docs/TEST.md)
  - [Audio Testing](hytale-plugin/docs/AUDIO_TESTING.md)
  - [Authentication Flow](hytale-plugin/docs/AUTHENTICATION.md)
  - [Test Scenarios](hytale-plugin/docs/TEST_SCENARIOS.md)

---

## 🛠️ Development

### Prerequisites
- **Voice Client**: Go 1.23+, PortAudio
- **Hytale Plugin**: Java 25+, Gradle, Hytale Server API files

### Building Both Components
```bash
# Build Java plugin
cd hytale-plugin && ./gradlew build

# Build Go client
cd voice-client && go build -o HytaleVoiceChat ./cmd/voice-client
```

---

## 📝 License

This project is for educational/personal use with Hytale.