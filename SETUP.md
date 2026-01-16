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
./gradlew clean build
```

All four modules will compile:
- `common` - Shared models and packets
- `voice-server` - UDP voice relay server
- `voice-client` - JavaFX desktop client
- `hytale-plugin` - Hytale server plugin

### 4. Run components

**Voice Server:**
```bash
./gradlew :voice-server:run
```

**Voice Client:**
```bash
./gradlew :voice-client:run
```

**Build Plugin for Deployment:**
```bash
./gradlew :hytale-plugin:build
# JAR is automatically copied to /Users/zoki/hytale/server/mods/
```

## Project Structure

```
hytale-voice-chat/
├── common/                 # Shared code (models, packets, config)
├── voice-server/           # UDP relay server with Opus codec
├── voice-client/           # JavaFX GUI with audio I/O
├── hytale-plugin/          # Hytale plugin integration
│   └── hytalefiles/        # (local, not committed)
│       ├── HytaleServer.jar
│       ├── HytaleServer.aot
│       └── Assets.zip
├── README.md              # Architecture overview
└── TEST.md                # Testing guide
```

## Important Notes

- **hytale-plugin/hytalefiles/** is in .gitignore - add locally
- All changes are committed to git for version control
- Use `git push` to sync with private repository

## Development

See [README.md](README.md) for architecture details.
See [TEST.md](TEST.md) for testing procedures.
