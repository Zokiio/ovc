# Reverse Proxy Deployment (Recommended)

Use a reverse proxy for TLS termination in production.

## Target Architecture

```text
Web Client (wss://voice.example.com/voice)
  -> Reverse Proxy (TLS termination)
  -> Plugin signaling server (ws://localhost:24455)
```

## Required Plugin Settings

Set these in `ovc.conf`:

```hocon
EnableSSL = false
SignalingPort = 24455
AllowedOrigins = "https://voice.example.com,https://example.com"
```

Reference: [Configuration reference](configuration.md)

## Nginx Example

```nginx
upstream voice_backend {
    server 127.0.0.1:24455;
}

server {
    listen 443 ssl http2;
    server_name voice.example.com;

    ssl_certificate /etc/letsencrypt/live/voice.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/voice.example.com/privkey.pem;

    location /voice {
        proxy_pass http://voice_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_buffering off;
    }
}

server {
    listen 80;
    server_name voice.example.com;
    return 301 https://$host$request_uri;
}
```

## Firewall Guidance

- Do not expose plugin signaling port externally when using localhost binding.
- Expose only HTTPS (`443/tcp`) publicly.
- If using fixed ICE ports, open/forward your configured UDP range (`IcePortMin..IcePortMax`).
- The ICE UDP range does not need to be huge; size it to expected peak concurrent voice users plus headroom.

## Validation Steps

1. Start plugin and confirm signaling port is listening.
2. Reload proxy and validate config syntax.
3. Test WebSocket upgrade from browser/client.
4. Verify no `Origin rejected` errors.

## See Also

- [Configuration reference](configuration.md)
- [Troubleshooting](troubleshooting.md)
- [Direct SSL deployment (advanced)](direct-ssl.md)
