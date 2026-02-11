# Direct SSL Deployment (Advanced)

Direct SSL means the plugin serves `wss://` itself. This is not the default production recommendation.

## When to Use This

Use direct SSL only when you cannot terminate TLS at a reverse proxy.

## Required Config Keys

Set these keys in `ovc.conf`:

```hocon
EnableSSL = true
SSLCertPath = "/etc/letsencrypt/live/voice.example.com/fullchain.pem"
SSLKeyPath = "/etc/letsencrypt/live/voice.example.com/privkey.pem"
AllowedOrigins = "https://voice.example.com"
```

For key details, defaults, and constraints, use the canonical reference:

- [Configuration reference](configuration.md)

## Certificate Requirements

- PEM certificate chain file.
- PEM private key file.
- Plugin process must be able to read both files.

Suggested file permissions:

```bash
chmod 644 /etc/letsencrypt/live/voice.example.com/fullchain.pem
chmod 600 /etc/letsencrypt/live/voice.example.com/privkey.pem
```

## Quick Verification

1. Start plugin and check logs for SSL initialization.
2. Connect client with `wss://...` endpoint.
3. Validate browser has no certificate warnings.

## Operational Caveats

- Certificate rotation/reload is typically easier with reverse proxies.
- Keep certificate paths outside repository and never commit cert/key files.

## See Also

- [Reverse proxy deployment (recommended)](reverse-proxy.md)
- [Troubleshooting](troubleshooting.md)
