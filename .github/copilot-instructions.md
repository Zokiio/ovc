# Copilot Customization Instructions

## Project Overview
Hybrid proximity-based voice chat system for Hytale with three components:
- Voice Server (UDP relay)
- Voice Client (JavaFX desktop app)
- Hytale Plugin (in-game integration)

## Architecture
- Multi-module Gradle project
- Java 17+ with Opus codec, OpenAL audio, Netty networking
- Three independently deployable components

## Key Files
- [build.gradle](build.gradle) - Root Gradle configuration
- [README.md](README.md) - Architecture and setup guide
- [voice-server/](voice-server/) - Voice relay server
- [voice-client/](voice-client/) - Desktop client with GUI
- [hytale-plugin/](hytale-plugin/) - Hytale event tracking

## Development Guidelines

### When Adding Features:
1. Determine which module(s) are affected
2. Add new classes to appropriate packages
3. Update module's build.gradle if new dependencies needed
4. Follow existing package structure

### Audio Implementation:
- Voice Server: Handle Opus compression, player routing
- Voice Client: Microphone/speaker I/O, 3D positioning
- Network: UDP packets, encryption, authentication

### Common Tasks:
- Implement UDP server: `voice-server/src/.../network/`
- Add audio processing: `voice-server/src/.../audio/`
- Extend GUI: `voice-client/src/.../gui/`
- Add Hytale hooks: `hytale-plugin/src/.../plugin/`

## Testing
Run individual modules:
```bash
./gradlew :voice-server:build
./gradlew :voice-client:build
./gradlew :hytale-plugin:build
```

## Resources
- Opus Codec: https://github.com/MaxHenkel/opus4j
- OpenAL: https://www.openal.org/
- Netty: https://netty.io/
- JavaFX: https://gluonhq.com/products/javafx/
