# Copilot Instructions for Hytale Voice Chat

## Project Overview

**Hytale Voice Chat** is a proximity-based voice chat system for the Hytale game server. It consists of two independent components that communicate via UDP:

- **Voice Client** (Go): Lightweight cross-platform desktop GUI application (Windows, macOS, Linux)
- **Hytale Plugin** (Java): Server-side plugin that routes audio based on player proximity using Netty UDP server

The voice client connects to the plugin's UDP server at port 24454. Audio is routed to players within 30 blocks, and authentication uses username mapping.

## Tech Stack

| Component | Technology | Key Details |
|-----------|-----------|-----------|
| **Voice Client** | Go 1.25 | Fyne UI framework, PortAudio capture/playback |
| **Hytale Plugin** | Java 25 | Gradle build system, Netty UDP server, Opus codec |
| **Common Library** | Java 25 | Shared packet models and serialization |
| **Audio** | Opus codec (opus4j 2.0.4) | 48kHz, 16-bit mono, 960 frames (20ms) |
| **Networking** | Netty 4.1.100, UDP | Custom packet protocol (0x01-0x05, 0x09) |
| **Dependencies** | See gradle.properties | Gson for JSON, SLF4J/Logback for logging |

## Build & Run

### Prerequisites
- **Java 25**: Required for both plugin and compilation
- **Go 1.25+**: Required for voice client
- **PortAudio + Opus dev libraries**: Required for Go client
  - macOS: `brew install portaudio opus`
  - Linux: `apt-get install portaudio19-dev libopus-dev libopusfile-dev`
  - Windows: Use MSYS2 MinGW (see voice-client/README.md)
- **Hytale Server JAR**: Set via `gradle-local.properties` (gitignored, not checked in)

### Build Commands

**Plugin (Java)**:
```bash
cd hytale-plugin
./gradlew clean build    # Output: build/libs/*.jar
```

**Voice Client (Go)**:
```bash
cd voice-client
go build -o HytaleVoiceChat ./cmd/voice-client
```

**Run Tests** (plugin):
```bash
cd hytale-plugin
./gradlew test
```

### Configuration

Create `hytale-plugin/gradle-local.properties` (template: `gradle-local.properties.example`):

```properties
# Set your Java 25 home
org.gradle.java.home=/Library/Java/JavaVirtualMachines/temurin-25.jdk/Contents/Home

# Set Hytale Server API path (required to compile)
hytale.api.path=/path/to/HytaleServer.jar

# Optional: Auto-copy JAR to mods folder
hytale.mods.path=/path/to/hytale/server/mods
```

Platform-specific paths are platform-specific and won't be committed to git.

## Project Structure

```
hytale-voice-chat/
├── .github/copilot-instructions.md      # This file
├── README.md                              # Architecture overview
├── hytale-plugin/                         # Java plugin
│   ├── src/main/java/com/hytale/voicechat/plugin/
│   │   ├── HytaleVoiceChatPlugin.java    # Main plugin entry
│   │   ├── audio/                        # Opus codec handling
│   │   ├── command/                      # Chat commands (/voice, /proximity)
│   │   ├── event/                        # Player events (join, move)
│   │   ├── listener/                     # Event listeners
│   │   ├── network/                      # UDP socket management
│   │   ├── tracker/                      # Player position tracking
│   │   └── group/                        # Voice groups (1.0.0-SNAPSHOT)
│   ├── common/src/main/java/com/hytale/voicechat/common/
│   │   ├── model/                        # PlayerPosition, AudioCodec enums
│   │   ├── network/                      # NetworkConfig (ports, frame sizes)
│   │   └── packet/                       # VoicePacket, AudioPacket, AuthenticationPacket, etc.
│   ├── docs/                             # Setup, testing, authentication docs
│   ├── build.gradle                      # Gradle config with fat JAR, Hytale API handling
│   └── gradlew                           # Gradle wrapper
└── voice-client/                          # Go voice client
    ├── cmd/voice-client/main.go          # Entry point
    ├── internal/client/
    │   ├── voice_client.go               # Core UDP client, audio streaming
    │   ├── audio_manager.go              # PortAudio integration
    │   ├── gui.go                        # Fyne UI
    │   ├── config.go                     # Config file persistence
    │   └── logging.go                    # Log file setup
    ├── Makefile                          # Build targets
    └── go.mod                            # Go dependencies
```

## Coding Guidelines

### Java (Hytale Plugin)

1. **Logging**: Use `HytaleLogger.forEnclosingClass()` (Hytale standard). Examples:
   - `logger.atInfo().log("message")`
   - `logger.atDebug().log("packet received")`

2. **Packet Serialization**: All packets inherit from `VoicePacket` base class
   - Implement `serialize()` → `byte[]` and static `deserialize(byte[])`
   - Byte format: `[type(1)] [clientId(16)] [data]` where clientId is UUID serialized as two longs
   - Use `ByteBuffer` for binary packing (UTF-8 for strings, big-endian default)

3. **Network Constants**: Use `NetworkConfig` class (default port 24454, frame size 960, etc.)

4. **UUID Handling**: Serialize UUIDs as 16 bytes (two longs):
   ```java
   UUID id = ...;
   buffer.putLong(id.getMostSignificantBits());
   buffer.putLong(id.getLeastSignificantBits());
   ```

5. **Proximity Calculation**: Default is 30 blocks, configurable via commands. Check [TEST.md](hytale-plugin/docs/TEST.md) for proximity testing.

6. **Player Tracking**: `PlayerPositionTracker` maps UUID → `PlayerPosition` (x, y, z). Updated via `PlayerMoveEventSystem`.

### Go (Voice Client)

1. **Logging**: Use `log` package or see `logging.go` for file-based logging to user config directory
   - Logs go to platform-specific locations (e.g., `~/Library/Application Support/hytale-voicechat/logs/`)

2. **Audio Constants**: 
   - Sample rate: 48kHz, frame size: 960 samples (20ms)
   - Opus codec: use `gopkg.in/hraban/opus.v2`
   - Audio headers: 25 bytes (legacy) or 26 bytes (with codec type)

3. **Packet Format**: Mirrors Java implementation
   - AudioPacket: `[0x02] [clientId(16)] [opus_data]`
   - AuthenticationPacket: `[0x01] [clientId(16)] [username_len(4)] [username]`

4. **Config Files**: Stored in platform-specific user config directory
   - Windows: `%AppData%\hytale-voicechat\client.json`
   - macOS: `~/Library/Application Support/hytale-voicechat/client.json`
   - Linux: `~/.config/hytale-voicechat/client.json`

5. **PortAudio Integration**: See `audio_manager.go` for microphone capture and speaker playback
   - Use `SimpleAudioManager` for basic setup

6. **GUI**: Built with Fyne (`fyne.io/fyne/v2`), see `gui.go` for UI layout

## Key Workflow: UDP Packet Exchange

1. **Client Authentication** (on startup):
   ```
   Client → AuthenticationPacket(clientId, username) → Server
   Server ← AuthenticationPacket (ack, logged)
   ```

2. **Audio Streaming** (continuous):
   ```
   Client → AudioPacket(senderId, opus_encoded_audio) → Server
   Server → AudioPackets to nearby players (within 30 blocks)
   ```

3. **Packet Types** (for reference):
   - `0x01`: AuthenticationPacket (client → server)
   - `0x02`: AudioPacket (bidirectional)
   - `0x03`: AuthAckPacket (server → client) [TODO: not yet implemented]
   - `0x04`: DisconnectPacket
   - `0x05`: TestAudioPacket (for testing)
   - `0x09`: ServerShutdownPacket

## Tools & Resources

### Build & Testing
- **Gradle wrapper** (`./gradlew`): All Java builds and tests
- **Makefile** (`voice-client/Makefile`): Go build targets
- **Test scenarios**: See [TEST.md](hytale-plugin/docs/TEST.md), [TEST_SCENARIOS.md](hytale-plugin/docs/TEST_SCENARIOS.md)
- **Audio testing**: See [AUDIO_TESTING.md](hytale-plugin/docs/AUDIO_TESTING.md)

### Documentation
- **Authentication flow**: [AUTHENTICATION.md](hytale-plugin/docs/AUTHENTICATION.md)
- **Setup guide**: [SETUP.md](hytale-plugin/docs/SETUP.md)
- **Voice client README**: [voice-client/README.md](voice-client/README.md)

### Common Commands
```bash
# Clean rebuild (removes all build artifacts)
cd hytale-plugin && ./gradlew clean build

# Run plugin tests
cd hytale-plugin && ./gradlew test

# Check listening port (plugin should be on 24454)
lsof -i :24454

# Build Go client
cd voice-client && go build -o HytaleVoiceChat ./cmd/voice-client
```

## Known Limitations & TODOs

- **Player position tracking**: Currently not integrated with Hytale server events in production
- **VAD (Voice Activity Detection)**: Framework exists in Go client, not yet enabled by default
- **Echo cancellation**: Not implemented
- **3D positional audio**: Not implemented (audio is mono, proximity only)

## Debugging Tips

1. **Plugin won't compile**: Ensure `hytale.api.path` in `gradle-local.properties` points to valid `HytaleServer.jar`
2. **Port 24454 already in use**: Kill Java process or change port in `NetworkConfig`
3. **Go client build fails**: Ensure PortAudio headers installed (`brew install portaudio opus`)
4. **Connection timeout**: Check firewall, ensure plugin is running on correct port
5. **Audio lag**: Check UDP packet loss, may need to increase buffer sizes in `audio_manager.go`

See [TEST.md](hytale-plugin/docs/TEST.md) for step-by-step testing procedures and expected outputs.
