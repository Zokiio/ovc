# Hytale Voice Chat - Setup Instructions

## Prerequisites

1. Java 25
2. Git

## Initial Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/hytale-voicechat.git
cd hytale-voicechat
```

### 2. Configure local properties (optional)

If you want auto-copy to your Hytale server's mods folder:

```bash
cd hytale-plugin
cp gradle-local.properties.example gradle-local.properties
# Edit gradle-local.properties with your Hytale server path
```

### 3. Build the project

```bash
cd hytale-plugin
./gradlew clean build
```

The build will automatically download the Hytale API from the official Maven repository.

Gradle builds:
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
# Copy to your Hytale server's mods/ directory
# Or use ./gradlew copyToHytale if configured
```

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

- The Hytale Server API is automatically downloaded from the official Maven repository
- Configure `gradle-local.properties` for auto-copy to your server's mods folder
- All changes are committed to git for version control
- Use `git push` to sync with repository

## Development

See [README.md](../../README.md) for architecture details.
See [TEST.md](TEST.md) for testing procedures.
