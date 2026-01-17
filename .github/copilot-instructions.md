# Copilot Customization Instructions

## Project Overview
Hybrid proximity-based voice chat system for Hytale with two main components:
- Voice Client (JavaFX desktop app)
- Hytale Plugin (in-game integration + integrated voice server)

## Architecture
- Multi-module Gradle project
- Java 25+ with Opus codec, OpenAL audio, Netty networking
- Three independently deployable components

## Key Files
- [build.gradle](build.gradle) - Root Gradle configuration
- [README.md](README.md) - Architecture and setup guide
- [voice-client/](voice-client/) - Desktop client with GUI
- [hytale-plugin/](hytale-plugin/) - Hytale plugin with integrated voice server

## Development Guidelines

### When Adding Features:
1. Determine which module(s) are affected
2. Add new classes to appropriate packages
3. Update module's build.gradle if new dependencies needed
4. Follow existing package structure

### Audio Implementation:
- Hytale Plugin: Handle Opus compression, player routing via UDP server
- Voice Client: Microphone/speaker I/O, 3D positioning
- Network: UDP packets, proximity-based routing

### Common Tasks:
- Implement UDP/audio logic: `hytale-plugin/src/.../network/` or `hytale-plugin/src/.../audio/`
- Extend GUI: `voice-client/src/.../gui/`
- Add Hytale hooks: `hytale-plugin/src/.../plugin/`

## Testing
Run individual modules:
```bash
./gradlew :voice-client:build
./gradlew :hytale-plugin:build
```

## Resources
- Opus Codec: https://github.com/MaxHenkel/opus4j
- OpenAL: https://www.openal.org/
- Netty: https://netty.io/
- JavaFX: https://gluonhq.com/products/javafx/
