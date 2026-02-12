# Obsolete Voice Chat Configuration Reference

This is the canonical reference for `ovc.conf`.

## Configuration File Location and Priority

1. `ovc.conf` (HOCON) next to the plugin runtime (primary)
2. System properties (`-D...`) for override use cases
3. Built-in defaults in `NetworkConfig`

Default file path: `./ovc.conf`

Custom path:

```bash
-Dvoice.config.file=/path/to/ovc.conf
```

## Recommended Baseline (Reverse Proxy)

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "https://ovc.zottik.com"
VoiceClientUrl = "https://ovc.zottik.com"
VoiceSignalingUrl = ""
StunServers = "stun:stun.cloudflare.com:3478,stun:stun.cloudflare.com:53"
TurnServers = ""
IcePortMin = 50000
IcePortMax = 51000
```

## Key Reference

`ovc.conf.example` contains operational template values. Runtime defaults are defined in code and may differ when keys are omitted.

| Key | Type | Template Value (`ovc.conf.example`) | Runtime Default (if omitted) | Notes |
|---|---|---|---|---|
| `SignalingPort` | Integer | `24455` | `24455` | WebSocket signaling port. |
| `EnableSSL` | Boolean | `false` | `false` | Keep `false` when using reverse proxy TLS termination. |
| `SSLCertPath` | String | `"/etc/letsencrypt/live/example.com/fullchain.pem"` | Same path string | Used when `EnableSSL = true`. |
| `SSLKeyPath` | String | `"/etc/letsencrypt/live/example.com/privkey.pem"` | Same path string | Used when `EnableSSL = true`. |
| `AllowedOrigins` | String | `"https://ovc.zottik.com"` | `"https://ovc.zottik.com"` | Comma-separated exact origins. |
| `VoiceClientUrl` | String | `"https://ovc.zottik.com"` | `"https://ovc.zottik.com"` | Optional public web client URL used for `/vc login` clickable deep links. Must be `http://` or `https://`. |
| `VoiceSignalingUrl` | String | `""` | Empty | Optional signaling endpoint (`ws://` or `wss://`) prefilled from `/vc login` links. |
| `GameQuitGraceSeconds` | Integer | `10` | `10` | Grace period before disconnecting web client after game quit. |
| `PendingGameJoinTimeoutSeconds` | Integer | `60` | `60` | Timeout while waiting for in-game session after auth. |
| `StunServers` | String | `"stun:stun.cloudflare.com:3478,stun:stun.cloudflare.com:53"` | Same list | Comma-separated STUN servers. |
| `TurnServers` | String | `""` | Empty | Comma-separated TURN servers. |
| `IcePortMin` | Integer | `50000` | `0` | Min ICE host UDP port. `0` means ephemeral. |
| `IcePortMax` | Integer | `51000` | `0` | Max ICE host UDP port. Must be `>= IcePortMin`. |
| `DefaultProximityRange` | Double | `50.0` | `50.0` | Default hearing range outside groups. |
| `ProximityFadeStart` | Double | `35.0` | `20.0` constant in code | Kept for compatibility; fade behavior is ratio-based in runtime comments. |
| `ProximityRolloffFactor` | Double | `1.5` | `1.5` | Larger value fades faster with distance. |
| `MaxVoiceDistance` | Double | `100.0` | `100.0` | Hard cap for voice range. |
| `PositionSampleIntervalMs` | Integer | `50` | `50` | Clamped to `20..500`. |
| `PositionBroadcastIntervalMs` | Integer | `50` | `50` | Clamped to `20..500`. |
| `USE_PROXIMITY_RADAR` | Boolean | `false` | `false` | Enables proximity radar metadata for clients. |
| `USE_PROXIMITY_RADAR_SPEAKING_ONLY` | Boolean | `false` | `false` | Radar shows only speaking players. |
| `PositionMinDistanceDelta` | Double | `0.25` | `0.25` | Clamped to `0.05..5.0`. |
| `PositionRotationThresholdDeg` | Double | `2.0` | `2.0` | Clamped to `0.1..45.0`. |
| `VolumeProcessingMode` | String | `"server"` | `"server"` | One of `server`, `client`, `both`. |
| `GroupGlobalVoice` | Boolean | `true` | `true` | Group members can hear each other across any distance. |
| `GroupSpatialAudio` | Boolean | `true` | `true` | Applies distance scaling to group voice. |
| `GroupMinVolume` | Double | `0.3` | `0.3` | Floor volume for group audio when spatial scaling applies. |
| `EnableOpusDataChannel` | Boolean | `true` | `true` | Enables Opus-over-DataChannel transport mode. |
| `OpusFrameDurationMs` | Integer | `20` | `20` | Clamped to `10..60`. |
| `OpusSampleRate` | Integer | `48000` | `48000` | Supported: `8000,12000,16000,24000,48000`. |
| `OpusChannels` | Integer | `1` | `1` | Clamped to `1..2`. |
| `OpusTargetBitrate` | Integer | `32000` | `32000` | Clamped to `6000..128000`. |

## WebRTC Transport Notes

- Audio transport is WebRTC DataChannel based.
- Signaling remains WebSocket-based.
- Reverse proxy deployment is the production default.

## Example Production Config

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "https://ovc.zottik.com"
VoiceClientUrl = "https://ovc.zottik.com"
VoiceSignalingUrl = ""
StunServers = "stun:stun.cloudflare.com:3478,stun:stun.cloudflare.com:53"
TurnServers = ""
IcePortMin = 50000
IcePortMax = 51000
DefaultProximityRange = 50.0
USE_PROXIMITY_RADAR = false
GroupGlobalVoice = true
GroupSpatialAudio = true
GroupMinVolume = 0.3
EnableOpusDataChannel = true
OpusFrameDurationMs = 20
OpusSampleRate = 48000
OpusChannels = 1
OpusTargetBitrate = 32000
```

## See Also

- [Reverse proxy deployment (recommended)](reverse-proxy.md)
- [Direct SSL deployment (advanced)](direct-ssl.md)
- [Troubleshooting](troubleshooting.md)
