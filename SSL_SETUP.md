# SSL/TLS Certificate Setup for WebRTC Signaling Server

This document explains how to configure SSL/TLS for the WebRTC signaling server.

## Development Mode (Default)

By default, the server runs in **non-SSL mode** (`ws://`) to avoid certificate issues during development.

**Configuration**: `NetworkConfig.ENABLE_SSL = false` (default)

**Web Client Connection**: Use `ws://localhost:24455` or `ws://your-server-ip:24455`

## Production Mode with Self-Signed Certificate

For testing with SSL but without a CA-signed certificate, the server can generate a self-signed certificate automatically.

**Configuration**: 
```java
// In NetworkConfig.java
public static final boolean ENABLE_SSL = true;
```

**Important**: Browsers will reject self-signed certificates by default. Users must:
1. Navigate to `https://your-server:24455` in their browser
2. Accept the security warning/add exception
3. Then the WebSocket connection will work

**Web Client Connection**: Use `wss://your-server:24455`

## Production Mode with CA-Signed Certificate

For production deployments, use a proper CA-signed SSL certificate.

### Step 1: Obtain an SSL Certificate

Get a certificate from:
- **Let's Encrypt** (free, automated): https://letsencrypt.org/
- **Commercial CA** (e.g., DigiCert, Sectigo)
- **Your organization's CA**

You'll need:
- `certificate.crt` - Your SSL certificate
- `private.key` - Your private key

### Step 2: Update the Server Code

Modify `WebRTCSignalingServer.java` to load your certificate:

```java
private SslContext createSSLContext() throws CertificateException, SSLException {
    try {
        logger.atInfo().log("Loading SSL certificate from file system");
        
        // Load your certificate and private key
        File certFile = new File("/path/to/certificate.crt");
        File keyFile = new File("/path/to/private.key");
        
        SslContext context = SslContextBuilder
                .forServer(certFile, keyFile)
                .build();
        
        logger.atInfo().log("SSL context created successfully with CA-signed certificate");
        return context;
    } catch (Exception e) {
        logger.atSevere().log("Failed to load SSL certificate", e);
        throw e;
    }
}
```

### Step 3: Enable SSL in Configuration

```java
// In NetworkConfig.java
public static final boolean ENABLE_SSL = true;
```

### Step 4: Configure Certificate Path

Consider making the certificate paths configurable:

```java
public static final String SSL_CERT_PATH = System.getProperty("voice.ssl.cert", "/etc/ssl/certs/voice-chat.crt");
public static final String SSL_KEY_PATH = System.getProperty("voice.ssl.key", "/etc/ssl/private/voice-chat.key");
```

Then start the server with:
```bash
java -Dvoice.ssl.cert=/path/to/cert.crt -Dvoice.ssl.key=/path/to/key.key -jar plugin.jar
```

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

## Reverse Proxy Setup (Recommended)

For production, consider using a reverse proxy (Nginx/Apache) to handle SSL:

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    # WebSocket upgrade
    location /voice {
        proxy_pass http://localhost:24455;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
```

With this setup:
- Keep `NetworkConfig.ENABLE_SSL = false` (Nginx handles SSL)
- Web client connects to `wss://your-domain.com/voice`
- Nginx terminates SSL and forwards to `ws://localhost:24455`

## Troubleshooting

### Browser Shows "Certificate Unknown" Error

**Problem**: `certificate_unknown` SSL handshake error

**Solutions**:
1. **Development**: Set `ENABLE_SSL = false` and use `ws://` instead of `wss://`
2. **Self-signed cert**: Manually accept the certificate in browser first
3. **Production**: Use a proper CA-signed certificate or reverse proxy

### Mixed Content Error

If your web client is served over HTTPS but tries to connect via WS (not WSS), browsers will block it.

**Solution**: Either serve the web client over HTTP, or use WSS for the WebSocket connection.

### Certificate Expired

Let's Encrypt certificates expire after 90 days. Set up auto-renewal:
```bash
sudo certbot renew --quiet
```

## Security Best Practices

1. **Never commit certificates to version control**
2. **Use proper file permissions**: `chmod 600` for private keys
3. **Keep certificates outside the application directory**
4. **Use environment variables or external config for paths**
5. **Monitor certificate expiration dates**
6. **Use strong ciphers in production**

## Quick Reference

| Mode | ENABLE_SSL | Protocol | Certificate | Use Case |
|------|-----------|----------|-------------|----------|
| Development | `false` | `ws://` | None | Local testing |
| Self-Signed | `true` | `wss://` | Auto-generated | Testing SSL flow |
| Production | `true` | `wss://` | CA-signed | Live deployment |
| Reverse Proxy | `false` | `ws://` (internal) | Handled by proxy | Production (recommended) |
