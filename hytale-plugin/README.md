# Hytale Voice Chat Plugin

Java plugin for Hytale that provides proximity-based voice chat functionality with an integrated UDP voice server.

## Requirements

- Java 25+ (Temurin recommended)
- Hytale Server installation
- HytaleServer.jar file (for compilation)

## Building

```bash
./gradlew build
```

This will:
1. Build the common module (shared packet formats)
2. Build the plugin module
3. Create a fat JAR with all dependencies included
4. (Optional) Copy the JAR to your Hytale server mods folder

## Configuration

Before building, update the paths in `build.gradle`:

```gradle
compileOnly files('/path/to/your/HytaleServer.jar')
```

And optionally configure the auto-copy destination:

```gradle
tasks.register('copyToHytale', Copy) {
    from jar.archiveFile
    into '/path/to/your/hytale/server/mods'
}
```

## Project Structure

```
hytale-plugin/
├── common/              # Shared packet formats and models
│   └── src/
│       └── main/java/
├── src/                 # Plugin source code
│   └── main/java/
├── build.gradle         # Build configuration
├── settings.gradle      # Gradle settings
└── gradle/              # Gradle wrapper
```

## Modules

- **common**: Shared packet formats, models, and network configuration used by both the plugin and clients
- **plugin** (root): Main plugin code including the UDP voice server, player tracking, and Hytale integration
