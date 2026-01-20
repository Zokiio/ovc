# Hytale Voice Chat - Setup Instructions

## Prerequisites

1. Java 25
2. Git
3. Hytale Server files (official API)

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/hytale-voicechat.git
cd hytale-voicechat
```

### 2. Add Hytale API files

The official Hytale API files need to be placed in your Hytale server directory:

```bash
# The build.gradle references files from your Hytale installation:
# /path/to/hytale/server/HytaleServer.jar
```

**Note:** Update the path in `hytale-plugin/build.gradle` to match your Hytale installation location if needed.

### 3. Build the project

```bash
cd hytale-plugin
./gradlew clean build
```

Gradle builds the shared library and the Hytale plugin:
- `common` - Shared models and packets
- Plugin JAR with all dependencies

### 4. Run components

**Voice Client:**
```bash
cd voice-client
go build -o HytaleVoiceChat ./cmd/voice-client
./HytaleVoiceChat
```

**Build Plugin for Deployment:**
```bash
cd hytale-plugin
./gradlew build
# JAR is in: hytale-plugin/build/libs/
# Copy manually to your Hytale server's mods/ directory
```

**Note:** You can configure auto-copy by setting up the `copyToHytale` task in `build.gradle` with your Hytale server path.

## Project Structure

```
hytale-voicechat/
├── voice-client/           # Go GUI client (Fyne + PortAudio)
├── hytale-plugin/          # Hytale plugin with integrated UDP voice server
│   ├── common/             # Shared code (models, packets, config)
│   ├── docs/               # Plugin documentation
│   ├── src/                # Plugin source code
│   └── build.gradle        # Build configuration
├── README.md               # Architecture overview
└── .gitignore
```

## Important Notes

- Use the Hytale Server JAR from your Hytale installation
- All changes are committed to git for version control
- Use `git push` to sync with repository

## Development

See [README.md](../../README.md) for architecture details.
See [TEST.md](TEST.md) for testing procedures.
