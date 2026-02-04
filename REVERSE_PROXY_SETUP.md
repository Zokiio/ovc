# Reverse Proxy Setup for WebSocket Server

Since your SSL certificate is automatically managed (Cloudflare, hosting provider, etc.), you should use a **reverse proxy** to handle SSL instead of the Java application.

## Architecture

```
Web Client (https://voice.example.com)
    ↓ wss:// (SSL encrypted)
Nginx/Apache/Cloud Proxy
    ↓ ws:// (no SSL - internal only)
Java Plugin (localhost:24455)
```

## Configuration Summary

- **Java Plugin**: Listens on `ws://localhost:24455` (SSL disabled)
- **Reverse Proxy**: Handles SSL termination and forwards to plugin
- **Web Client**: Connects to `wss://voice.example.com/voice`

---

## Option 1: Nginx Configuration (Recommended)

### Install Nginx (if not already installed)
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### Configure Nginx

Create or edit `/etc/nginx/sites-available/voice-websocket`:

```nginx
# Upstream backend (your Java plugin)
upstream voice_backend {
    server localhost:24455;
}

server {
    listen 443 ssl http2;
    server_name voice.example.com;
    
    # SSL certificate (automatically managed by your hosting provider)
    # Usually these are already configured if your site has HTTPS
    ssl_certificate /path/to/your/cert.pem;
    ssl_certificate_key /path/to/your/key.pem;
    
    # Modern SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # WebSocket endpoint
    location /voice {
        proxy_pass http://voice_backend;
        proxy_http_version 1.1;
        
        # WebSocket upgrade headers
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Forward client info
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts (keep connection alive)
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        
        # Disable buffering for real-time data
        proxy_buffering off;
    }
    
    # Optional: Serve your web client static files
    location / {
        root /var/www/voice-client;
        try_files $uri $uri/ /index.html;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name voice.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Enable and Test

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/voice-websocket /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check status
sudo systemctl status nginx
```

---

## Option 2: Cloudflare Setup

If you're using Cloudflare:

### 1. Enable WebSocket Support
- Go to Cloudflare dashboard
- Navigate to **Network** settings
- Enable **WebSockets**

### 2. Configure Origin Server
Your Java plugin runs on `ws://localhost:24455` (no SSL needed)

### 3. Cloudflare Workers (Optional Advanced)

Create a Cloudflare Worker to route WebSocket traffic:

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Route /voice to your origin server
    if (url.pathname === '/voice') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader === 'websocket') {
        // Forward to your origin server
        return fetch('ws://your-server-ip:24455/voice', request);
      }
    }
    
    return new Response('Not found', { status: 404 });
  }
};
```

---

## Option 3: Apache Configuration

If you're using Apache:

### Enable Required Modules
```bash
sudo a2enmod proxy proxy_http proxy_wstunnel ssl
```

### Configure Virtual Host

Edit `/etc/apache2/sites-available/voice-websocket.conf`:

```apache
<VirtualHost *:443>
    ServerName voice.example.com
    
    SSLEngine on
    SSLCertificateFile /path/to/cert.pem
    SSLCertificateKeyFile /path/to/key.pem
    
    # WebSocket proxy
    ProxyPass /voice ws://localhost:24455/voice
    ProxyPassReverse /voice ws://localhost:24455/voice
    
    # Preserve host header
    ProxyPreserveHost On
    
    # WebSocket support
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} websocket [NC]
    RewriteRule /(.*) ws://localhost:24455/$1 [P,L]
</VirtualHost>

<VirtualHost *:80>
    ServerName voice.example.com
    Redirect permanent / https://voice.example.com/
</VirtualHost>
```

### Enable and Reload
```bash
sudo a2ensite voice-websocket
sudo systemctl reload apache2
```

---

## Deployment Steps

### 1. Deploy Java Plugin
```bash
# Copy the built JAR to your server
scp hytale-plugin/build/libs/*.jar user@voice.example.com:/opt/voice-chat/

# SSH to server
ssh user@voice.example.com

# Start the plugin (it will listen on ws://localhost:24455)
cd /opt/voice-chat
java -jar plugin.jar
```

### 2. Configure Reverse Proxy
Choose one of the options above (Nginx, Cloudflare, or Apache)

### 3. Test Connection
From your browser console:
```javascript
const ws = new WebSocket('wss://voice.example.com/voice');
ws.onopen = () => console.log('✅ Connected via reverse proxy!');
ws.onerror = (e) => console.error('❌ Connection failed:', e);
```

---

## Firewall Configuration

### Internal Communication Only
Since the Java plugin only listens on localhost, you DON'T need to open port 24455 externally:

```bash
# Make sure port 24455 is NOT exposed
sudo ufw status

# Only HTTPS (443) needs to be open for external access
sudo ufw allow 443/tcp
```

This is more secure - the Java application is only accessible through the reverse proxy.

---

## Troubleshooting

### WebSocket Connection Failed

**Check if Java plugin is running:**
```bash
netstat -tlnp | grep 24455
# Should show: tcp 0 0 127.0.0.1:24455 0.0.0.0:* LISTEN
```

**Test local WebSocket:**
```bash
curl --include \
     --no-buffer \
     --header "Connection: Upgrade" \
     --header "Upgrade: websocket" \
     --header "Sec-WebSocket-Version: 13" \
     --header "Sec-WebSocket-Key: test" \
     http://localhost:24455/voice
```

**Check reverse proxy logs:**
```bash
# Nginx
sudo tail -f /var/log/nginx/error.log

# Apache
sudo tail -f /var/log/apache2/error.log
```

### 502 Bad Gateway

- Java plugin is not running
- Wrong port in proxy configuration
- Firewall blocking localhost communication

### SSL Certificate Errors

If your hosting provider manages SSL automatically, you may not need to specify certificate paths in the Nginx/Apache config - they might already be configured globally.

---

## Benefits of Reverse Proxy Approach

✅ **No Java SSL complexity** - Web server handles SSL  
✅ **Automatic certificate renewal** - Let your provider handle it  
✅ **Better performance** - Nginx/Apache optimized for SSL  
✅ **Additional security** - Plugin not directly exposed  
✅ **Centralized config** - All SSL settings in one place  
✅ **Easy certificate updates** - No Java restart needed  

---

## Web Client Connection

Your web client should connect to:
```typescript
const serverUrl = 'wss://voice.example.com/voice';
const ws = new WebSocket(serverUrl);
```

The protocol will be:
- Client → Nginx/Cloudflare: `wss://` (SSL encrypted)
- Nginx/Cloudflare → Java Plugin: `ws://` (internal, no encryption needed)

---

## Related Files

- `NetworkConfig.java` - Set `ENABLE_SSL = false` for reverse proxy setup
- `DOMAIN_CONFIGURATION.md` - Origin validation settings
- `SSL_SETUP.md` - Direct SSL configuration (not needed with reverse proxy)
