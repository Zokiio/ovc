# Troubleshooting

## "Origin rejected" in Browser Console

Symptoms:

- Client fails WebSocket handshake.
- Logs indicate origin validation failure.

Checks:

1. Ensure requesting origin is included in `AllowedOrigins`.
2. Include protocol (`https://` or `http://`) in each entry.
3. Match exact origin (host + scheme + port where relevant).

Reference: [Configuration reference](configuration.md)

## WebSocket Connection Fails

Checks:

1. Confirm plugin signaling service is listening on configured `SignalingPort`.
2. Validate reverse proxy WebSocket upgrade headers.
3. Confirm proxy path matches client connection path (`/voice` if configured).
4. Confirm firewall/network path allows expected traffic.

## 502 Bad Gateway (Proxy)

Common causes:

- Plugin not running.
- Proxy upstream target port is wrong.
- Localhost/upstream access blocked.

## "Certificate files not found" Warning

If `EnableSSL = true`, verify:

- `SSLCertPath` exists and is readable.
- `SSLKeyPath` exists and is readable.

Example check:

```bash
ls -la /etc/letsencrypt/live/voice.example.com/
```

Reference: [Direct SSL deployment](direct-ssl.md)

## No Remote Audio Despite Connection

Checks:

1. Confirm ICE configuration (`StunServers`, `TurnServers`, and optional `IcePortMin`/`IcePortMax`).
2. If behind NAT and using fixed ports, verify UDP range forwarding.
3. Confirm group/proximity settings are not suppressing expected audio path.
4. Confirm client audio permissions and selected devices.

## Debug Checklist

- Capture plugin startup logs.
- Capture reverse proxy access/error logs.
- Validate active `ovc.conf` content.
- Confirm client endpoint and environment values.

## See Also

- [Configuration reference](configuration.md)
- [Reverse proxy deployment](reverse-proxy.md)
- [Direct SSL deployment](direct-ssl.md)
