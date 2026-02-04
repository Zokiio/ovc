# SSL/TLS Certificate Setup for WebRTC Signaling Server

This document explains SSL/TLS configuration options for the WebRTC signaling server.

## Recommended Approach: Reverse Proxy

**For production deployments, use a reverse proxy (Nginx, Apache, Traefik, Cloudflare) to handle SSL.**

See [REVERSE_PROXY_SETUP.md](REVERSE_PROXY_SETUP.md) for detailed configuration.

### Why Reverse Proxy?

✅ **Simpler certificate management** - Let web servers handle SSL  
✅ **Automatic renewal** - Certbot/ACME integration  
✅ **Better performance** - Optimized SSL implementations  
✅ **Additional security** - Plugin not directly exposed  
✅ **Centralized configuration** - All SSL in one place  

### Configuration

```hocon
# In ovc.conf
EnableSSL = false  # Reverse proxy handles SSL
SignalingPort = 24455
```

---

## Alternative: Direct SSL (Advanced)

Only use direct SSL if you cannot use a reverse proxy.

### Step 1: Obtain SSL Certificate

Get a certificate from:
- **Let's Encrypt** (free, automated): https://letsencrypt.org/
- **Commercial CA** (e.g., DigiCert, Sectigo)
- **Your organization's CA**

You'll need:
- `certificate.crt` - Your SSL certificate
- `private.key` - Your private key

### Step 2: Configure in ovc.conf

```hocon
# Enable SSL in plugin
EnableSSL = true

# Certificate paths
SSLCertPath = "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
SSLKeyPath = "/etc/letsencrypt/live/yourdomain.com/privkey.pem"

# Allowed origins
AllowedOrigins = "https://yourdomain.com"
```

### Step 3: Restart Plugin

The plugin will load certificates on startup.

## Using Let's Encrypt with Certbot

1. Install Certbot:
   ```bash
   # Ubuntu/Debian
   sudo apt-get install certbot
   
   # CentOS/RHEL
   sudo yum install certbot
   
   # macOS
   brew install certbot
   ```

2. Obtain a certificate:
   ```bash
   sudo certbot certonly --standalone -d your-domain.com
   ```

3. Certificate files will be at:
   - Certificate: `/etc/letsencrypt/live/your-domain.com/fullchain.pem`
   - Private Key: `/etc/letsencrypt/live/your-domain.com/privkey.pem`

4. Set up auto-renewal:
   ```bash
   sudo certbot renew --dry-run
   ```

5. Add a cron job to restart your server after renewal:
   ```bash
   sudo crontab -e
   # Add:
   0 3 * * * certbot renew --quiet --deploy-hook "systemctl restart hytale-voice-chat"
   ```

## Security Best Practices

1. **Never commit certificates to version control**
2. **Use proper file permissions**: `chmod 600` for private keys
3. **Keep certificates outside the application directory**
4. **Use environment variables or external config for paths**
5. **Monitor certificate expiration dates**
6. **Use strong ciphers in production**

## Configuration Summary

| Scenario | EnableSSL | Protocol | Certificate | Notes |
|----------|-----------|----------|-------------|-------|
| Development | `false` | `ws://` | None | Local testing |
| Production (Recommended) | `false` | `ws://` (internal) | Handled by reverse proxy | See REVERSE_PROXY_SETUP.md |
| Direct SSL (Advanced) | `true` | `wss://` | CA-signed | Plugin handles SSL directly |
