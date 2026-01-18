# Hytale Voice Chat

Proximity-based voice chat for Hytale with a Go desktop client and a Java plugin
that runs the UDP voice server inside the game.

## Components

- **Go Client** (`go-client/`)
  - Cross-platform GUI built with Fyne.
  - Captures microphone audio, sends UDP packets, and plays received audio.
  - Stores server/device preferences and writes logs to the user config folder.
- **Hytale Plugin** (`hytale-plugin/`)
  - Netty UDP server for voice packets.
  - Tracks players and routes audio by proximity when positions are available.
- **Common** (`common/`)
  - Shared packet formats and models used by the server/plugin.

## Quick Start

1. Build the plugin and start your Hytale server:
   ```bash
   ./gradlew :hytale-plugin:build
   ```
2. Build the Go client:
   ```bash
   cd go-client
   go build -o HytaleVoiceChat ./cmd/voice-client
   ```
3. Run the client and connect to your server:
   ```bash
   ./HytaleVoiceChat
   ```

For platform-specific build steps, config locations, and log locations, see:
[`go-client/README.md`](go-client/README.md).

## Project Structure

```
hytale-voice-chat/
├── common/                # Shared models + packet formats
├── go-client/             # Go GUI client (Fyne + PortAudio)
├── hytale-plugin/         # Hytale plugin with integrated UDP server
│   └── hytalefiles/        # (local, not committed)
├── README.md
├── SETUP.md
└── TEST.md
```
# Hytale Voice Chat

## Go Client

For those looking to use the Go client, please refer to the following details from the go-client's README:

[Go Client README](https://github.com/yourusername/go-client)

Make sure to follow the installation and usage instructions provided there.

## Java Client

To run the Java client, ensure you are using Java version 25 Temurin. Other versions such as Java 17+ may work but are not officially supported. 

For more information, check the official Java documentation.