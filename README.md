![Hytale Voice Chat Logo](.github/images/logo.png)

# Hytale Voice Chat

Proximity-based voice chat for Hytale using a Java SFU and a browser client over WebRTC.

## Supported client

`voice-app/` is the only supported client.

`webrt/` contains legacy build artifacts and is not maintained.

## Repository layout

- `voice-app/`: React + TypeScript browser client
- `hytale-plugin/`: Java plugin with signaling, WebRTC, routing, and game integration
- `HYTALE_CONFIGURATION.md`: Complete server configuration reference
- `REVERSE_PROXY_SETUP.md`: Reverse proxy setup examples
- `SSL_SETUP.md`: Direct SSL setup notes

## Architecture

1. Client authenticates with the plugin over WebSocket signaling.
2. Plugin establishes WebRTC peer/data-channel transport.
3. Client audio frames are routed server-side based on proximity/group rules.
4. Optional proximity metadata (`distance`, `maxRange`) is embedded in routed audio payloads when `USE_PROXIMITY_RADAR = true`.

## Quick start

### 1) Build the plugin

```bash
cd hytale-plugin
./gradlew build
```

Copy the generated JAR from `hytale-plugin/build/libs/` into your Hytale server `mods/` folder.

### 2) Configure the plugin

Create `ovc.conf` from `hytale-plugin/src/main/resources/ovc.conf.example` and adjust values for your environment.

Audio transport mode is fixed to WebRTC DataChannel (no WebSocket audio fallback).

### 3) Run the web client

```bash
cd voice-app
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`).

## Important server config keys

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "https://example.com,http://localhost:5173"
StunServers = "stun:stun.cloudflare.com:3478,stun:stun.cloudflare.com:53"
TurnServers = ""
IcePortMin = 50000
IcePortMax = 51000
GameQuitGraceSeconds = 10
PendingGameJoinTimeoutSeconds = 60
USE_PROXIMITY_RADAR = false
```

See `HYTALE_CONFIGURATION.md` for full defaults, ranges, and troubleshooting.

## Development

### Plugin

```bash
cd hytale-plugin
./gradlew build
./gradlew test
```

### Web app

```bash
cd voice-app
npm run lint
npm run build
```

For live server smoke tests, set `VOICE_SERVER_URL`, `VOICE_USERNAME`, and optional `VOICE_AUTH_TOKEN`, then run:

```bash
cd voice-app
npx playwright test tests/live-server.spec.ts
```

## License

For personal and educational use with Hytale.
