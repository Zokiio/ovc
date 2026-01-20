# Copilot Customization Instructions

## Project Overview
Hybrid proximity-based voice chat system for Hytale with two main components:
- Voice Client (Go desktop app with Fyne UI)
- Hytale Plugin (in-game integration + integrated voice server)

## Architecture
- Voice Client: Go 1.25+ with Fyne UI, PortAudio, Opus codec
- Hytale Plugin: Java 25 with Netty networking, Opus4j codec, multi-module Gradle project
- Two independently deployable components sharing a common protocol

## Key Files
- [README.md](README.md) - Architecture and setup guide
- [voice-client/](voice-client/) - Go desktop client with Fyne GUI
- [voice-client/go.mod](voice-client/go.mod) - Go dependencies
- [voice-client/Makefile](voice-client/Makefile) - Build targets for client
- [hytale-plugin/build.gradle](hytale-plugin/build.gradle) - Root Gradle configuration for plugin
- [hytale-plugin/](hytale-plugin/) - Hytale plugin with integrated voice server
- [hytale-plugin/common/](hytale-plugin/common/) - Shared protocol definitions

## Development Guidelines

### When Adding Features:
1. Determine which module(s) are affected
2. Add new code to appropriate packages/modules
3. Voice Client: Update go.mod if new dependencies needed, follow Go package structure
4. Hytale Plugin: Update module's build.gradle if new dependencies needed, follow Java package structure
5. Shared protocol: Update common module for cross-component changes

### Audio Implementation:
- Voice Client (Go): PortAudio for mic/speaker I/O, Opus codec via hraban/opus.v2, 3D spatial audio, VAD, PTT
- Hytale Plugin (Java): Opus4j compression, player routing via Netty UDP server
- Network: UDP packets with proximity-based routing, shared protocol in common module

### Common Tasks:
- Voice Client GUI (Go): `voice-client/internal/client/gui.go`
- Voice Client audio (Go): `voice-client/internal/client/audio_manager.go`
- Voice Client networking (Go): `voice-client/internal/client/voice_client.go`
- Plugin UDP/audio logic (Java): `hytale-plugin/src/.../network/` or `hytale-plugin/src/.../audio/`
- Add Hytale hooks (Java): `hytale-plugin/src/.../plugin/`
- Shared protocol: `hytale-plugin/common/src/.../packet/`

## Testing
Build and test individual components:

**Voice Client (Go):**
```bash
cd voice-client
make build          # Build for current platform
make build-all      # Build for all platforms
go test ./...       # Run tests
```

**Hytale Plugin (Java):**
```bash
cd hytale-plugin
./gradlew build
./gradlew test
```

## Resources

**Voice Client (Go):**
- Fyne UI: https://fyne.io/
- PortAudio: http://www.portaudio.com/
- Opus Go Bindings: https://github.com/hraban/opus
- Go Documentation: https://go.dev/doc/

**Hytale Plugin (Java):**
- Opus4j Codec: https://github.com/MaxHenkel/opus4j
- Netty: https://netty.io/
- Gradle: https://gradle.org/
