# Hytale Voice Chat - Hybrid System

A hybrid proximity-based voice chat system for Hytale consisting of a Hytale plugin with an integrated voice server.

## Architecture

### Two Components:

1. **Common Module** (`common/`)
   - Shared data models (PlayerPosition, etc.)
   - Network packets (AudioPacket, VoicePacket)
   - Configuration constants
   - Used by both client and plugin

2. **Hytale Plugin** (`hytale-plugin/`)
   - Integrated UDP voice server on port 24454
   - Player position tracking in-game
   - Proximity-based audio routing (30 block range)
   - Opus audio codec compression/decompression
   - Integrates with Hytale event system
   - Manages player joins/quits

## Technology Stack

- **Language**: Java 17+
- **Build System**: Gradle 9.x with Java Toolchain
- **Audio Codecs**: Opus (de.maxhenkel.opus4j)
- **Audio I/O**: Java Sound API (input), LWJGL OpenAL (3D output)
- **Networking**: Netty (UDP)
- **JSON**: Gson
- **Logging**: SLF4J + Logback

## Project Structure

```
hytale-voice-chat/
├── common/                 # Shared models and packets
│   └── src/main/java/
│       └── com/hytale/voicechat/common/
│           ├── model/      # PlayerPosition
│           ├── packet/     # AudioPacket, VoicePacket
│           └── network/    # NetworkConfig
├── hytale-plugin/          # Hytale plugin with integrated voice server
│   └── src/main/java/
│       └── com/hytale/voicechat/plugin/
│           ├── audio/      # OpusCodec
│           ├── network/    # UDPSocketManager
│           └── tracker/    # PlayerPositionTracker
├── build.gradle            # Root Gradle config
├── settings.gradle         # Module definitions
└── gradle.properties       # Dependency versions
```

## Building

```bash
# Build all modules
./gradlew build

# Build specific module
./gradlew :hytale-plugin:build
./gradlew :common:build
```

## Running

### Install Hytale Plugin:
```bash
# Build and auto-copy to Hytale server mods folder
./gradlew :hytale-plugin:build

# The plugin is automatically copied to /Users/zoki/hytale/server/mods/
# Then restart your Hytale server
```

## How It Works

1. **Hytale Plugin** with integrated voice server:
   - Tracks player positions in-game
   - Starts UDP server on port 24454
   - Routes audio packets based on proximity (30 block range)

2. **Plugin processes audio**:
   - Receives audio packets from clients via UDP
   - Calculates which players are in proximity (30 block range)
   - Routes packets only to nearby players
   - Uses 3D distance calculation for filtering

## Configuration

### Network Ports
- Voice UDP: `24454` (integrated in plugin)

### Audio Settings
- Sample Rate: `48000 Hz`
- Frame Size: `960 samples` (20ms)
- Channels: `Mono`
- Codec: `Opus`

### Proximity
- Default Distance: `30.0 blocks`
- Max Distance: `100.0 blocks`

## Development

### Key Classes

**Common:**
- `PlayerPosition` - Player location data
- `AudioPacket` - Encoded audio data packet
- `NetworkConfig` - Shared constants

**Hytale Plugin:**
- `HytaleVoiceChatPlugin` - Main plugin class
- `UDPSocketManager` - Netty UDP server with proximity routing
- `OpusCodec` - Audio encoding/decoding
- `PlayerPositionTracker` - In-memory position tracking

## Next Steps

- [x] Set up multi-module Gradle project
- [x] Create common module with shared models
- [x] Implement basic UDP voice server with Opus
- [x] Implement Hytale plugin with position tracking
- [x] Integrate voice server into plugin (combined deployment)
- [x] Implement proximity-based routing logic (30 block range)
- [x] Username-based authentication system
- [x] Link players to in-game audio
- [x] Real-time audio streaming (mic capture + UDP transmission)
- [x] Full-duplex audio (simultaneous send/receive)
- [ ] Implement actual Hytale API event hooks
- [ ] Add encryption for voice data (AES)
- [ ] Implement voice activity detection (VAD)
- [ ] Add configuration files
- [ ] Write integration tests

## Dependencies

See [gradle.properties](gradle.properties) for version information:
- Netty 4.1.100
- Gson 2.10.1
- Opus4j 2.0.7
- LWJGL 3.3.3
- JavaFX 21.0.1
- OkHttp 4.12.0

## License

MIT