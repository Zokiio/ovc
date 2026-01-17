# Hytale Voice Chat - Hybrid System

A hybrid proximity-based voice chat system for Hytale consisting of a desktop client and Hytale plugin with integrated voice server.

## Architecture

### Three Components:

1. **Common Module** (`common/`)
   - Shared data models (PlayerPosition, etc.)
   - Network packets (AudioPacket, VoicePacket)
   - Configuration constants
   - Used by both client and plugin

2. **Voice Client** (`voice-client/`)
   - Desktop JavaFX application
   - Microphone capture (Java Sound API)
   - Speaker output (OpenAL for 3D positioning)
   - Opus codec support
   - Real-time audio transmission to voice server

3. **Hytale Plugin** (`hytale-plugin/`)
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
- **GUI**: JavaFX 21
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
├── voice-client/           # Desktop client application
│   └── src/main/java/
│       └── com/hytale/voicechat/client/
│           ├── audio/      # MicrophoneManager, SpeakerManager
│           └── gui/        # VoiceChatGUI
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
./gradlew :voice-client:build
./gradlew :hytale-plugin:build
./gradlew :common:build

# Create executable JARs
./gradlew :voice-server:jar
./gradlew :voice-client:jar
```

## Running

### Start Voice Client:
```bash
./gradlew :voice-client:run

# Or directly
java -jar voice-client/build/libs/voice-client-1.0.0-SNAPSHOT.jar
```

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

2. **Voice Clients** connect to plugin server:
   - Authenticate with unique client ID
   - Stream microphone audio (encoded with Opus)
   - Receive and play audio from nearby players only

3. **Hytale Plugin** tracks players:
   - Monitors player movement events
   - Sends position updates to voice server API every 50ms
   - Notifies server of player joins/quits

4. **Server routes audio**:
3. **Plugin processes audio**:
   - Receives audio packets from clients via UDP
   - Calculates which players are in proximity (30 block range)
   - Routes packets only to nearby players
   - Uses 3D distance calculation for filtering

4. **Clients render audio**:
   - Decode Opus audio streams
   - Use OpenAL for 3D positional audio
   - Apply volume based on distance

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

**Voice Client:**
- `VoiceChatClient` - Main client class
- `MicrophoneManager` - Audio capture
- `SpeakerManager` - OpenAL playback
- `VoiceChatGUI` - JavaFX interface

**Hytale Plugin:**
- `HytaleVoiceChatPlugin` - Main plugin class
- `UDPSocketManager` - Netty UDP server with proximity routing
- `OpusCodec` - Audio encoding/decoding
- `PlayerPositionTracker` - In-memory position tracking

## Next Steps

- [x] Set up multi-module Gradle project
- [x] Create common module with shared models
- [x] Implement basic UDP voice server with Opus
- [x] Create JavaFX client with microphone capture
- [x] Implement Hytale plugin with position tracking
- [x] Integrate voice server into plugin (combined deployment)
- [x] Implement proximity-based routing logic (30 block range)
- [ ] Connect microphone to UDP transmission
- [ ] Wire Opus encoding/decoding to audio pipeline
- [ ] Implement OpenAL 3D audio playback
- [ ] Add encryption for voice data (AES)
- [ ] Implement voice activity detection (VAD)
- [ ] Add GUI volume controls and device selection
- [ ] Create authentication system
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
