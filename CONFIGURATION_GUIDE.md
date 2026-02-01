# Configuration Guide for Hytale Voice Chat Plugin

## Overview

Users can now configure the plugin **without rebuilding** by using:
1. **Config file** (`voice-chat.properties`) - easiest for distribution
2. **System properties** - for command-line overrides
3. **Default values** - fallback if nothing is configured

## Quick Start

### Step 1: Copy the Config File

```bash
# Copy the example to your deployment directory
cp voice-chat.properties.example voice-chat.properties

# Edit the config file with your settings
nano voice-chat.properties
```

### Step 2: Run the Plugin with Config

```bash
# Plugin will auto-load voice-chat.properties from current directory
java -jar plugin.jar

# Or specify custom config path
java -Dvoice.config.file=/etc/voice-chat/config.properties -jar plugin.jar
```

## Configuration Options

All options can be set in `voice-chat.properties` or as system properties (`-D` flags).

### WebSocket Port

**Property key:** `voice.signaling.port`  
**Type:** Integer  
**Default:** `24455`  
**Description:** Port for WebSocket signaling server

**Example:**
```properties
voice.signaling.port=24455
```

Or via command line:
```bash
java -Dvoice.signaling.port=24455 -jar plugin.jar
```

### SSL/TLS Configuration

**Property key:** `voice.ssl.enabled`  
**Type:** Boolean (`true` or `false`)  
**Default:** `false`  
**Description:** Enable SSL in plugin (only if NOT using reverse proxy)

**Example - Using Reverse Proxy (Recommended):**
```properties
voice.ssl.enabled=false
```

**Example - Direct SSL (Advanced):**
```properties
voice.ssl.enabled=true
voice.ssl.cert=/path/to/cert.pem
voice.ssl.key=/path/to/key.pem
```

### SSL Certificate Paths

**Property keys:**
- `voice.ssl.cert` - Path to certificate file (PEM format)
- `voice.ssl.key` - Path to private key file (PEM format)

**Type:** String  
**Default:** `/etc/letsencrypt/live/hytale.techynoodle.com/...`  
**Description:** Only needed if `voice.ssl.enabled=true`

**Example:**
```properties
voice.ssl.enabled=true
voice.ssl.cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
voice.ssl.key=/etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### Allowed Origins (CORS)

**Property key:** `voice.allowed.origins`  
**Type:** Comma-separated string  
**Default:** `https://hytale.techynoodle.com,https://voice.techynoodle.com,http://localhost:5173,...`  
**Description:** List of domains allowed to connect via WebSocket

**Example:**
```properties
voice.allowed.origins=https://yourdomain.com,https://anotherdomain.com,http://localhost:3000
```

## Configuration Priority

Settings are loaded in this order (first match wins):

1. **Config file** (`voice-chat.properties`)
2. **System property** (command-line `-D` flag)
3. **Default value** (hardcoded in code)

Example with multiple sources:
```bash
# Config file has: voice.signaling.port=24455
# System property overrides it: -Dvoice.signaling.port=9000
# Result: port 9000 is used
java -Dvoice.signaling.port=9000 -jar plugin.jar
```

## Common Configuration Examples

### Development with Reverse Proxy

```properties
# voice-chat.properties
voice.signaling.port=24455
voice.ssl.enabled=false
voice.allowed.origins=http://localhost:3000,http://localhost:5173,https://yourdomain.com
```

Start the plugin:
```bash
java -jar plugin.jar
```

Configure your reverse proxy (Nginx/Traefik) to forward `wss://yourdomain.com/voice` to `ws://localhost:24455`.

### Production with Direct SSL

```properties
# voice-chat.properties
voice.signaling.port=24455
voice.ssl.enabled=true
voice.ssl.cert=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
voice.ssl.key=/etc/letsencrypt/live/yourdomain.com/privkey.pem
voice.allowed.origins=https://yourdomain.com,https://app.yourdomain.com
```

Start the plugin:
```bash
java -jar plugin.jar
```

Web client connects to: `wss://yourdomain.com:24455/voice`

### Multiple Domains

```properties
voice.allowed.origins=https://app.example.com,https://chat.example.com,https://yourdomain.com,http://localhost:3000
```

## Troubleshooting

### Configuration Not Loading

Check server logs for:
```
[VoiceConfig] Loading configuration from: /path/to/voice-chat.properties
```

If file not found:
```
[VoiceConfig] Configuration file not found: voice-chat.properties, using system properties and defaults
```

**Solution:** Ensure `voice-chat.properties` is in the same directory as the JAR, or specify path with `-Dvoice.config.file=/path/to/config.properties`

### Invalid Property Values

If you see:
```
[VoiceConfig] Invalid integer value for voice.signaling.port: "not-a-number", using default: 24455
```

**Solution:** Check your config file for proper formatting. Numbers should not be quoted:
```properties
# ✅ Correct
voice.signaling.port=24455

# ❌ Wrong
voice.signaling.port="24455"
```

### Origins Not Accepted

If browser shows origin rejection error:
```
[WebRTCSignalingServer] Rejected WebSocket connection from unauthorized origin: https://mysite.com
```

**Solution:** Add the domain to `voice.allowed.origins`:
```properties
voice.allowed.origins=https://mysite.com,https://yourdomain.com
```

## Distribution to Users

### For End Users

1. **Rename config file:**
   ```bash
   mv voice-chat.properties.example voice-chat.properties
   ```

2. **Edit configuration** with their settings:
   ```bash
   nano voice-chat.properties
   ```

3. **Run the plugin:**
   ```bash
   java -jar hytale-voice-chat-plugin.jar
   ```

No rebuild needed! Users can edit the config file anytime and restart.

### For Docker

```dockerfile
FROM openjdk:17-slim

WORKDIR /app
COPY plugin.jar .
COPY voice-chat.properties .

CMD ["java", "-jar", "plugin.jar"]
```

Users can mount a custom config:
```bash
docker run -v /my/config/voice-chat.properties:/app/voice-chat.properties myimage
```

## Testing Configuration

Test that config loads correctly:
```bash
# With verbose output (prints to stderr)
java -jar plugin.jar

# Look for these lines:
# [VoiceConfig] Loading configuration from: ...
# [VoiceConfig] Loaded configuration from file: ...
```

Override via command line for testing:
```bash
# Test with different port
java -Dvoice.signaling.port=8080 -jar plugin.jar

# Test with different config file
java -Dvoice.config.file=/tmp/test-config.properties -jar plugin.jar
```

## Files

- `voice-chat.properties.example` - Sample configuration file
- `VoiceConfig.java` - Configuration loader class  
- `NetworkConfig.java` - Uses VoiceConfig to load all settings
