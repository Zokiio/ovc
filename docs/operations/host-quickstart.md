# Host Quickstart (Plugin + Voice Client)

Practical setup guide for running Obsolete Voice Chat (OVC) as a server operator.

## Who this is for

This guide is for server hosts and operators who need to deploy and validate OVC for players.

Baseline prerequisites:

- Java 25
- Node.js 22.x LTS
- npm 10+

## Path A: Install from a release (recommended)

Use release assets for first-time setup and production installs.

1. Open the [latest GitHub Release](https://github.com/Zokiio/hytale-voicechat/releases/latest).
2. Download the plugin artifact named `ovc-plugin-<version>.jar`.
3. Copy the jar into your Hytale server `mods/` directory.
4. Restart the server and confirm plugin startup logs are present.

Why this path: release assets are the fastest and most predictable install path for operators.

## Path B: Build from source (fallback)

Use this when you need an unreleased commit or custom local build.

```bash
cd hytale-plugin
./gradlew build
```

Copy the generated jar from `hytale-plugin/build/libs/` into your Hytale server `mods/` directory.

## Create and tune `ovc.conf`

Create `ovc.conf` from the template and set values for your domain and network.

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "https://ovc.zottik.com"
VoiceClientUrl = "https://ovc.zottik.com"
VoiceSignalingUrl = "wss://voice.example.com/voice"
StunServers = "stun:stun.cloudflare.com:3478,stun:stun.cloudflare.com:53"
IcePortMin = 50000
IcePortMax = 50063
```

Use the full key reference for defaults, constraints, and all optional keys:

- [Configuration reference](configuration.md)

### ICE port range sizing (important)

You do not need to open `50000-51000` unless you expect very high concurrency.

Current OVC web client sessions are DataChannel-first, so capacity is typically close to one UDP port per connected web client.

Port math:

- `UDP ports needed = IcePortMax - IcePortMin + 1`
- Start with `peak_concurrent_clients * 1.25` ports (adds headroom), then round up to a practical block size.

Recommended presets (starting at `50000`):

| Peak concurrent users | Open UDP ports | Config |
|---|---:|---|
| 10 | 16 | `IcePortMin = 50000`, `IcePortMax = 50015` |
| 25 | 32 | `IcePortMin = 50000`, `IcePortMax = 50031` |
| 50 | 64 | `IcePortMin = 50000`, `IcePortMax = 50063` |
| 100 | 128 | `IcePortMin = 50000`, `IcePortMax = 50127` |

If the configured ICE range is too small, the plugin can fall back to ephemeral ports. Keep enough headroom so your forwarded firewall range remains authoritative.

## Choose web-client path

You can use the hosted OVC client at `https://ovc.zottik.com` without running your own web client.

### Option 1 (recommended): Hosted OVC client

Set:

- `VoiceClientUrl` to `https://ovc.zottik.com`
- `AllowedOrigins` to include `https://ovc.zottik.com`
- `VoiceSignalingUrl` to your public signaling endpoint (`wss://...`, optional but recommended for `/vc login` prefill)

### Option 2 (optional): Self-hosted web client

If you need a custom client deployment, build and host your own:

```bash
cd voice-app
npm ci
npm run build
```

Serve `voice-app/dist/` over HTTPS (Nginx/Caddy/CDN/static host), then set:

- `VoiceClientUrl` to your hosted client URL
- Ensure `AllowedOrigins` includes that exact hosted origin
- Set `VoiceSignalingUrl` so `/vc login` links prefill your server endpoint

## Expose signaling safely

Production default is reverse proxy TLS termination:

- [Reverse proxy deployment (recommended)](reverse-proxy.md)

Firewall summary:

- Open `443/tcp` publicly (required).
- Open `IcePortMin..IcePortMax/udp` publicly and forward to the plugin host.
- Keep plugin signaling port internal when reverse-proxied (`24455/tcp` should not be public).
- Optionally open `80/tcp` only for HTTP -> HTTPS redirect.

## Operator smoke test (10 minutes)

1. Start or restart the Hytale server and confirm OVC plugin startup logs.
2. In game, run `/vc login`.
3. Open the generated prefilled link (or manually enter username/code in the web client).
4. Connect and verify client shows connected status.
5. With a second account, validate proximity voice behavior in-world.
6. Validate group flow:
   - Create a group: `/vc create <name>`
   - Join a group: `/vc join <name>`
   - Leave the group: `/vc leave`
7. Confirm voice behavior still works after group changes.

## Essential operator commands

- `/vc login`: Generate or retrieve your login code and prefilled client link.
- `/vc resetcode`: Rotate login code and invalidate the old one.
- `/vc list`: List active voice groups.
- `/vc gui`: Open in-game voice group UI.
- `/vc hud [true|false]`: Show/hide mic HUD indicator.
- `/vc mute [true|false]`: Mute or unmute connected web client mic from game.
- `/vc isolated <true|false>`: Toggle isolation mode for your group (group creator only).
- `/vc proximity <distance>`: View/update proximity distance (requires `voicechat.admin.proximity` permission).

## Common first-day failures

- Origin mismatch or "Origin rejected": add the exact web origin (scheme + host + port) to `AllowedOrigins`.
- `ws://` vs `wss://` mismatch: use `wss://` for HTTPS client deployments and align proxy config.
- ICE/UDP connectivity issues: open/forward `IcePortMin..IcePortMax` and validate STUN/TURN/network path.
- Microphone permission denied: user can connect listen-only, then retry permission from `Audio Config`.

Deep-dive troubleshooting:

- [Troubleshooting](troubleshooting.md)

## Next steps

- [Configuration reference](configuration.md)
- [Reverse proxy deployment (recommended)](reverse-proxy.md)
- [Direct SSL deployment (advanced)](direct-ssl.md)
- [Troubleshooting](troubleshooting.md)
- [Support policy](support.md)
