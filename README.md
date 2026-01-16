# Hytale Voice Chat - Hybrid System

A hybrid proximity-based voice chat system for Hytale consisting of a dedicated voice server, desktop client, and Hytale plugin.

## Architecture

### Four Components:

1. **Common Module** (`common/`)
   - Shared data models (PlayerPosition, etc.)
   - Network packets (AudioPacket, VoicePacket)
   - Configuration constants
   - Used by all other modules

2. **Voice Server** (`voice-server/`)
   - Standalone UDP server handling voice data relay
   - Player management and proximity-based routing
   - Opus audio codec compression/decompression
   - REST API for receiving player positions from Hytale plugin
   - Port: 24454 (UDP), 24455 (HTTP API)

3. **Voice Client** (`voice-client/`)
   - Desktop JavaFX application
   - Microphone capture (Java Sound API)
   - Speaker output (OpenAL for 3D positioning)
   - Opus codec support
   - Real-time audio transmission to voice server

4. **Hytale Plugin** (`hytale-plugin/`)
   - Tracks player positions in-game
   - Sends proximity data to voice server via REST API
   - Integrates with Hytale event system
   - Manages player joins/quits

## Technology Stack

- **Language**: Java 17+
- **Build System**: Gradle 8.x with Java Toolchain
- **Audio Codecs**: Opus (de.maxhenkel.opus4j)
- **Audio I/O**: Java Sound API (input), LWJGL OpenAL (3D output)
- **Networking**: Netty (UDP), OkHttp (REST API)
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
├── voice-server/           # Main voice relay server
│   └── src/main/java/
│       └── com/hytale/voicechat/server/
│           ├── audio/      # OpusCodec
│           └── network/    # UDPSocketManager
├── voice-client/           # Desktop client application
│   └── src/main/java/
│       └── com/hytale/voicechat/client/
│           ├── audio/      # MicrophoneManager, SpeakerManager
│           └── gui/        # VoiceChatGUI
├── hytale-plugin/          # In-game Hytale plugin
│   └── src/main/java/
│       └── com/hytale/voicechat/plugin/
│           ├── api/        # VoiceServerAPIClient
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
./gradlew :voice-server:build
./gradlew :voice-client:build
./gradlew :hytale-plugin:build
./gradlew :common:build

# Create executable JARs
./gradlew :voice-server:jar
./gradlew :voice-client:jar
```

## Running

### Start Voice Server:
```bash
./gradlew :voice-server:run

# Or with custom port
java -jar voice-server/build/libs/voice-server-1.0.0-SNAPSHOT.jar 24454
```

### Start Voice Client:
```bash
./gradlew :voice-client:run

# Or directly
java -jar voice-client/build/libs/voice-client-1.0.0-SNAPSHOT.jar
```

### Install Hytale Plugin:
```bash
# Build the plugin
./gradlew :hytale-plugin:build

# Copy to Hytale plugins directory (update path as needed)
cp hytale-plugin/build/libs/hytale-plugin-1.0.0-SNAPSHOT.jar /path/to/hytale/plugins/
```

## How It Works

1. **Voice Server** runs continuously:
   - Listens on UDP port 24454 for voice data
   - Exposes REST API on port 24455 for position updates

2. **Voice Clients** connect to server:
   - Authenticate with unique client ID
   - Stream microphone audio (encoded with Opus)
   - Receive and play audio from other clients

3. **Hytale Plugin** tracks players:
   - Monitors player movement events
   - Sends position updates to voice server API every 50ms
   - Notifies server of player joins/quits

4. **Server routes audio**:
   - Receives encoded audio packets from clients
   - Calculates which players are in proximity (default 30 blocks)
   - Routes packets only to nearby players
   - Uses 3D distance for volume attenuation

5. **Clients render audio**:
   - Decode Opus audio streams
   - Use OpenAL for 3D positional audio
   - Apply volume based on distance

## Configuration

### Network Ports
- Voice UDP: `24454` (default)
- API HTTP: `24455` (default)

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

**Voice Server:**
- `VoiceServer` - Main server class
- `UDPSocketManager` - Netty UDP handler
- `OpusCodec` - Audio encoding/decoding

**Voice Client:**
- `VoiceChatClient` - Main client class
- `MicrophoneManager` - Audio capture
- `SpeakerManager` - OpenAL playback
- `VoiceChatGUI` - JavaFX interface

**Hytale Plugin:**
- `HytaleVoiceChatPlugin` - Main plugin class
- `VoiceServerAPIClient` - REST API client
- `PlayerPositionTracker` - Position update scheduler

## Next Steps

- [x] Set up multi-module Gradle project
- [x] Create common module with shared models
- [x] Implement basic UDP voice server with Opus
- [x] Create JavaFX client with microphone capture
- [x] Implement Hytale plugin with position tracking
- [ ] Add REST API endpoint to voice server
- [ ] Implement proximity-based routing logic
- [ ] Connect microphone to UDP transmission
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
