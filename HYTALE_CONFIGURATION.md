# Hytale Voice Chat Configuration Guide

This document explains how to configure the Hytale Voice Chat plugin using the standard Hytale configuration system with fallback to the legacy VoiceConfig system.

## Configuration Methods (Priority Order)

The plugin loads configuration in the following priority order:

1. **HOCON Configuration File** (`ovc.conf`) - *Primary configuration method*
2. **System Properties** - Via `-D` JVM flags  
3. **Default Values** - Built-in defaults

## Configuration File Location

### Hytale Standard (HOCON Format)

Place `ovc.conf` in the same directory as your plugin JAR or specify custom path:
- **Default location**: `./ovc.conf` (current working directory)
- **Custom location**: `-Dvoice.config.file=/path/to/ovc.conf`

## Configuration Properties

### `SignalingPort` (Integer)
The port for the WebSocket signaling server.

- **Default**: `24455`
- **Example**: `SignalingPort = 8080`
- **System Property**: `-Dvoice.signaling.port=8080`

### `EnableSSL` (Boolean)
Whether to enable SSL/TLS for WebSocket connections.

- **Default**: `false`
- **Recommended**: `false` when using a reverse proxy (Traefik, Nginx, Apache)
- **Set to true** only if Java needs to handle SSL directly
- **Example**: `EnableSSL = false`
- **System Property**: `-Dvoice.ssl.enabled=true`

### `SSLCertPath` (String)
Path to the SSL certificate file (PEM format).

- **Default**: `/etc/letsencrypt/live/hytale.techynoodle.com/fullchain.pem`
- **Used when**: `EnableSSL = true`
- **Format**: PEM-encoded X.509 certificate
- **Example**: `SSLCertPath = "/etc/letsencrypt/live/example.com/fullchain.pem"`
- **System Property**: `-Dvoice.ssl.cert=/path/to/cert.pem`

### `SSLKeyPath` (String)
Path to the SSL private key file (PEM format).

- **Default**: `/etc/letsencrypt/live/hytale.techynoodle.com/privkey.pem`
- **Used when**: `EnableSSL = true`
- **Format**: PEM-encoded RSA private key (unencrypted)
- **Example**: `SSLKeyPath = "/etc/letsencrypt/live/example.com/privkey.pem"`
- **System Property**: `-Dvoice.ssl.key=/path/to/key.pem`

### `AllowedOrigins` (String)
Comma-separated list of domains allowed to connect via WebSocket (CORS).

- **Default**: `https://hytale.techynoodle.com,https://voice.techynoodle.com,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173`
- **Format**: Comma-separated domain URLs
- **Wildcard**: Use `"*"` to allow all origins (NOT recommended for production)
- **Example**:
  ```hocon
  AllowedOrigins = "https://example.com,https://voice.example.com,http://localhost:5173"
  ```
- **System Property**: `-Dvoice.allowed.origins=https://example.com,https://voice.example.com`

## Configuration Example

### HOCON Format (ovc.conf)

```hocon
# WebSocket signaling server configuration
SignalingPort = 24455

# SSL/TLS settings (disabled for reverse proxy setup)
EnableSSL = false
SSLCertPath = "/etc/letsencrypt/live/voice.example.com/fullchain.pem"
SSLKeyPath = "/etc/letsencrypt/live/voice.example.com/privkey.pem"

# Allowed origins for WebSocket connections
AllowedOrigins = "https://example.com,https://voice.example.com,http://localhost:5173"
```

### System Properties via JVM Arguments

```bash
java -Dvoice.signaling.port=24455 \
     -Dvoice.ssl.enabled=false \
     -Dvoice.ssl.cert=/etc/letsencrypt/live/voice.example.com/fullchain.pem \
     -Dvoice.ssl.key=/etc/letsencrypt/live/voice.example.com/privkey.pem \
     -Dvoice.allowed.origins="https://example.com,https://voice.example.com" \
     -jar hytale-plugin.jar
```

## Reverse Proxy Setup (Recommended)

When using Traefik, Nginx, or Apache as a reverse proxy that handles SSL:

```hocon
# Disable SSL in plugin - reverse proxy handles it
EnableSSL = false

# Plugin runs on plain HTTP internally
SignalingPort = 24455

# External domain(s) that map to this service
AllowedOrigins = "https://voice.example.com,https://example.com"
```

### Traefik Configuration Example

```yaml
ovc-voice-ws-router:
  rule: Host(`voice.example.com`) && PathPrefix(`/voice`)
  service: ovc-voice-ws-service
  entryPoints: [websecure]
  tls:
    certResolver: letsencrypt

ovc-voice-ws-service:
  loadBalancer:
    servers:
      - url: http://192.168.1.180:24455  # Plain HTTP to plugin
```

## Direct SSL Setup (Development Only)

For testing with self-signed certificates:

```hocon
EnableSSL = true
SSLCertPath = "/path/to/cert.pem"
SSLKeyPath = "/path/to/key.pem"
AllowedOrigins = "https://localhost:24455"
```

## Troubleshooting

### "Certificate files not found" Warning

If you see this warning with `EnableSSL = true`:

```
Certificate files not found at /etc/letsencrypt/live/..., using self-signed certificate
```

**Solution**: Verify certificate paths exist and are readable:
```bash
ls -la /etc/letsencrypt/live/voice.example.com/
```

### "Origin rejected" Error in Browser Console

If the web client cannot connect:

1. Check the browser console for the error
2. Verify the requesting domain is in `AllowedOrigins`
3. Domain must include protocol (https:// or http://)
4. Exact match is required (no wildcards except "*")

Example:
- ✅ Correct: `https://voice.example.com` in `AllowedOrigins`
- ❌ Wrong: `voice.example.com` (missing protocol)
- ❌ Wrong: `https://*.example.com` (pattern not supported)

### WebSocket Connection Fails

1. Check signaling port is accessible from client
2. Verify allowed origins are correctly configured
3. Ensure SSL settings match reverse proxy configuration
4. Check firewall rules permit WebSocket connections

## File Permissions

Ensure certificate and key files have proper permissions:

```bash
# Certificate: readable by the plugin user
chmod 644 /etc/letsencrypt/live/voice.example.com/fullchain.pem

# Private key: readable ONLY by the plugin user
chmod 600 /etc/letsencrypt/live/voice.example.com/privkey.pem
```

## Migration from Legacy to HOCON Format

The plugin supports both formats for backward compatibility. To migrate:

1. Create `ovc.conf` with same properties
2. Keep `voice-chat.json` as backup
3. Test with HOCON format
4. Remove `voice-chat.json` once verified working

Note: HOCON format takes priority if both files exist.

## Environment-Specific Configuration

### Development (localhost)

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
```

### Staging (reverse proxy with SSL)

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "https://staging-voice.example.com"
```

### Production (reverse proxy with SSL)

```hocon
SignalingPort = 24455
EnableSSL = false
AllowedOrigins = "https://voice.example.com,https://example.com"
```

## See Also

- [Reverse Proxy Setup Guide](REVERSE_PROXY_SETUP.md)
- [Domain Configuration](DOMAIN_CONFIGURATION.md)
- [SSL Setup Guide](SSL_SETUP.md)
