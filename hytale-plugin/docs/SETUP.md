# Hytale Voice Chat - Setup Instructions

## Prerequisites

1. Java 21+ (LTS recommended)
2. Git
3. Hytale Server files (official API)

## Initial Setup

### 1. Clone the repository

```bash
git clone git@github.com:YOUR_USERNAME/Hytale-Voice-Chat.git
cd Hytale-Voice-Chat
```

### 2. Add Hytale API files

The official Hytale API files need to be placed locally:

```bash
mkdir -p hytale-plugin/hytalefiles
cp /path/to/HytaleServer.jar hytale-plugin/hytalefiles/
cp /path/to/HytaleServer.aot hytale-plugin/hytalefiles/
cp /path/to/Assets.zip hytale-plugin/hytalefiles/
```

**Note:** These files are not committed to git due to their size. Add them locally for development.

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
# JAR is automatically copied to /Users/zoki/hytale/server/mods/
```

## Project Structure

```
hytale-voice-chat/
├── voice-client/           # Go GUI client (Fyne + PortAudio)
├── hytale-plugin/          # Hytale plugin with integrated UDP voice server
│   ├── common/             # Shared code (models, packets, config)
│   ├── docs/               # Plugin documentation
│   ├── src/                # Plugin source code
│   ├── hytalefiles/        # (local, not committed)
│   │   ├── HytaleServer.jar
│   │   ├── HytaleServer.aot
│   │   └── Assets.zip
│   └── build.gradle        # Build configuration
├── README.md               # Architecture overview
└── .gitignore
```

## Important Notes

- **hytale-plugin/hytalefiles/** is in .gitignore - add locally
- All changes are committed to git for version control
- Use `git push` to sync with private repository

## Development

See [README.md](../../README.md) for architecture details.
See [TEST.md](TEST.md) for testing procedures.
