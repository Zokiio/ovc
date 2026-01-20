# Hytale Voice Chat

Proximity-based voice chat for Hytale with a Go desktop client and a Java plugin that runs the UDP voice server inside the game.

## Components

- **Go Client** (`go-client/`)
  - Cross-platform GUI built with Fyne
  - Captures microphone audio, sends UDP packets, and plays received audio
  - Stores server/device preferences and writes logs to the user config folder
  
- **Hytale Plugin** (`hytale-plugin/`)
  - Java plugin with integrated UDP voice server
  - Netty UDP server for voice packets
  - Tracks players and routes audio by proximity
  - Includes common module for shared packet formats

## Quick Start

### Build Everything

```bash
make all
```

Or build components individually:

```bash
# Build the plugin
make build-plugin

# Build the client
make build-client
```

### Build the Hytale Plugin

```bash
cd hytale-plugin
./gradlew build
```

### Build the Go Client

```bash
cd go-client
go build -o HytaleVoiceChat ./cmd/voice-client
```

### Run the Client

```bash
./HytaleVoiceChat
```

For detailed instructions, see:
- [Go Client README](go-client/README.md)
- [Hytale Plugin README](hytale-plugin/README.md)

## Project Structure

```
hytale-voice-chat/
├── go-client/             # Go GUI client (Fyne + PortAudio)
├── hytale-plugin/         # Java plugin with integrated UDP server
│   ├── common/            # Shared models + packet formats
│   ├── src/               # Plugin source code
│   ├── build.gradle       # Gradle build configuration
│   └── settings.gradle    # Gradle settings
├── Makefile               # Root build commands
├── README.md              # This file
└── .gitignore             # Git ignore rules
```

## Requirements

- **Go Client**: Go 1.21+ 
- **Hytale Plugin**: Java 25+ (Temurin recommended)