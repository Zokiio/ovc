# Domain Configuration & Origin Validation

## Overview

The WebRTC signaling server validates the origin of WebSocket connections to prevent unauthorized access and cross-site WebSocket hijacking attacks.

## Approved Domains

The following origins are approved by default:

### Production
- `https://voice.techynoodle.com` - Main production website

### Local Development
- `http://localhost:5173` - Vite development server
- `http://localhost:3000` - React/Next.js development server
- `http://127.0.0.1:5173` - Alternative localhost address

## Configuration

### Default Configuration

Defined in `NetworkConfig.java`:
```java
public static final String ALLOWED_ORIGINS = System.getProperty("voice.allowed.origins", 
    "https://voice.techynoodle.com,http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173");
```

### Adding New Domains

**Method 1: Modify Source Code**

Edit `hytale-plugin/common/src/main/java/com/hytale/voicechat/common/network/NetworkConfig.java`:
```java
public static final String ALLOWED_ORIGINS = System.getProperty("voice.allowed.origins", 
    "https://voice.techynoodle.com,https://newdomain.com,https://anotherdomain.com");
```

Then rebuild:
```bash
cd hytale-plugin
./gradlew clean build -x test
```

**Method 2: System Property (No Rebuild Required)**

Pass allowed origins as a command-line argument:
```bash
java -Dvoice.allowed.origins="https://voice.techynoodle.com,https://newdomain.com" -jar plugin.jar
```

**Method 3: Environment Variable**

Set the system property via environment:
```bash
export JAVA_OPTS="-Dvoice.allowed.origins=https://voice.techynoodle.com,https://newdomain.com"
java $JAVA_OPTS -jar plugin.jar
```

## Security Notes

### ⚠️ Wildcard Origin (Development Only)

To allow connections from any origin during development:
```bash
java -Dvoice.allowed.origins="*" -jar plugin.jar
```

**WARNING:** Never use wildcard (`*`) in production! It allows any website to connect to your server, which is a serious security vulnerability.

### Origin Format Requirements

- Include the full protocol: `https://` or `http://`
- Do not include trailing slashes
- Port numbers are included in the origin (e.g., `http://localhost:5173`)
- Multiple origins are comma-separated with no spaces after commas

### What Happens on Rejection

When a connection from an unauthorized origin is attempted:
1. The server logs a warning with the rejected origin
2. Returns HTTP 403 Forbidden
3. Connection is immediately closed
4. No WebSocket handshake occurs

## SSL Configuration

The server is configured to use Let's Encrypt SSL certificates:

- **Certificate Path**: `/etc/letsencrypt/live/voice.techynoodle.com/fullchain.pem`
- **Private Key Path**: `/etc/letsencrypt/live/voice.techynoodle.com/privkey.pem`

Override paths if needed:
```bash
java -Dvoice.ssl.cert=/path/to/cert.pem -Dvoice.ssl.key=/path/to/key.pem -jar plugin.jar
```

## Troubleshooting

### Connection Refused Error

**Symptom:** WebSocket connection fails with 403 Forbidden

**Solution:** 
1. Check the server logs for "Rejected WebSocket connection from unauthorized origin"
2. Verify the origin matches exactly (including protocol and port)
3. Add the origin to the allowed list

### CORS Errors in Browser

**Symptom:** Browser console shows CORS policy errors

**Solution:**
- Ensure the web page's origin is in the allowed list
- Check that HTTPS pages use `wss://` protocol
- Check that HTTP pages use `ws://` protocol (local dev only)

### Mixed Content Errors

**Symptom:** HTTPS page cannot connect to WebSocket

**Solution:**
- Use `wss://` (secure WebSocket) for HTTPS pages
- Ensure SSL is properly configured on the server
- Never use `ws://` from an HTTPS page (browsers will block it)

## Server Logs

The server logs origin validation events:

```
[INFO] Allowed origins for WebSocket connections: [https://voice.techynoodle.com, http://localhost:5173, ...]
[FINE] Accepting WebSocket connection from origin: https://voice.techynoodle.com
[WARNING] Rejected WebSocket connection from unauthorized origin: https://malicious-site.com
```

## Best Practices

1. **Whitelist only necessary domains** - Don't add origins you don't control
2. **Use HTTPS in production** - Always use `https://` for production domains
3. **Separate dev and prod configs** - Use system properties to differentiate environments
4. **Monitor logs** - Watch for rejected connection attempts
5. **Update after domain changes** - Remember to update allowed origins when deploying to new domains
6. **Test origin validation** - Verify unauthorized origins are properly rejected

## Related Files

- `hytale-plugin/common/src/main/java/com/hytale/voicechat/common/network/NetworkConfig.java` - Origin configuration
- `hytale-plugin/src/main/java/com/hytale/voicechat/plugin/webrtc/WebRTCSignalingServer.java` - Origin validation logic
- `SSL_SETUP.md` - SSL certificate configuration guide
