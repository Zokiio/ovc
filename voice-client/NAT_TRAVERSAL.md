# NAT Traversal Guide

This guide explains how the Hytale Voice Chat client handles NAT (Network Address Translation) traversal to enable connectivity without manual port forwarding.

## Overview

NAT traversal allows the voice client to automatically establish UDP connections through routers without requiring users to manually configure port forwarding. This significantly improves ease of use for players.

## Features

### 1. UPnP Port Mapping (IGD)
**Internet Gateway Device (IGD) Protocol via UPnP**

The client automatically discovers UPnP-enabled routers and creates temporary port mappings for the voice chat connection.

**How it works:**
1. Client discovers UPnP gateway on local network
2. Requests external IP address from gateway
3. Creates UDP port mapping (external port → internal port)
4. Maintains mapping while connected
5. Removes mapping on disconnect

**Benefits:**
- No manual router configuration
- Works on most home routers (60-80% have UPnP enabled)
- Automatic cleanup on disconnect

**Limitations:**
- Requires UPnP to be enabled on router
- May not work on corporate/school networks
- Some ISPs disable UPnP for security

### 2. STUN Discovery
**Session Traversal Utilities for NAT (RFC 5389)**

The client uses STUN to discover its public IP address and port as seen from the internet.

**How it works:**
1. Client sends STUN binding request to public STUN server
2. STUN server responds with client's public IP:port
3. Client displays this information for diagnostics
4. Multiple STUN requests detect NAT type

**STUN Servers Used:**
- stun.l.google.com:19302
- stun1.l.google.com:19302
- stun2.l.google.com:19302

**Benefits:**
- Discovers public endpoint
- Detects NAT type
- Works through most NAT types
- Free public STUN servers available

### 3. NAT Type Detection

The client automatically detects and classifies your NAT configuration:

| NAT Type | Description | Connectivity | Action Needed |
|----------|-------------|--------------|---------------|
| **Open** | Public IP address, no NAT | Excellent | None |
| **Moderate** | Full cone or restricted cone NAT | Good | UPnP should work |
| **Strict** | Port-restricted cone NAT | Limited | May need manual forwarding |
| **Symmetric** | Different mapping per destination | Poor | TURN relay needed (future) |
| **Blocked** | Firewall blocks UDP | None | Check firewall settings |

## User Interface

### Connection Panel

After connecting, the client displays:

```
Connection: Good ✓
```

### Settings Checkbox

- ☑ **Automatic Router Setup (Recommended)** - Automatically enables UPnP port mapping and STUN discovery for best connectivity

When this option is enabled (default), the client will attempt to configure your router via UPnP and use STUN to discover your public endpoint without requiring manual configuration.

### Connection Info Button

Click "Connection Info" to see detailed information in a user-friendly format:

```
✓ Good connection
✓ Router configured automatically

Your IP: 203.0.113.45
```

## Configuration

Settings are saved in `client.json`:

```json
{
  "enableUPnP": true,
  "enableSTUN": true,
  ...
}
```

## Implementation Details

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Voice Client (Go)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  nat_traversal.go                                   │   │
│  │  • UPnP Discovery & Port Mapping                    │   │
│  │  • STUN Binding Requests                            │   │
│  │  • NAT Type Detection                               │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│                           │ Integrated in                    │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  voice_client.go                                    │   │
│  │  • NAT setup on Connect()                           │   │
│  │  • Cleanup on Disconnect()                          │   │
│  │  • Status reporting                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
               │                              │
               │ UPnP/IGD                     │ STUN
               ▼                              ▼
         ┌──────────┐              ┌──────────────────┐
         │  Router  │              │  STUN Server     │
         │  (IGD)   │              │  (Google)        │
         └──────────┘              └──────────────────┘
```

### Libraries Used

- **goupnp** (v1.3.0): UPnP/IGD protocol implementation
  - GitHub: https://github.com/huin/goupnp
  - Handles UPnP discovery and port mapping

- **pion/stun** (v0.6.1): STUN protocol implementation
  - GitHub: https://github.com/pion/stun
  - RFC 5389 compliant STUN client

### Key Functions

**NAT Traversal Module** (`nat_traversal.go`):
- `SetupPortMapping()` - Creates UPnP port mapping
- `RemovePortMapping()` - Removes UPnP port mapping
- `DiscoverPublicEndpoint()` - STUN discovery
- `DetectNATType()` - NAT type classification
- `GetNATInfo()` - Complete NAT status

**Voice Client Integration** (`voice_client.go`):
- `SetNATTraversal()` - Enable/disable features
- `GetNATInfo()` - Retrieve current NAT info
- `GetNATStatus()` - Human-readable status string

## Troubleshooting

### UPnP Not Working

**Check router settings:**
1. Access router admin panel (usually 192.168.1.1 or 192.168.0.1)
2. Look for "UPnP" or "IGD" settings
3. Enable if disabled
4. Restart router if needed

**Common issues:**
- UPnP disabled in router settings
- Router doesn't support IGD protocol
- Multiple routers/NAT layers (double NAT)
- Corporate/school network restrictions

**Workaround:** Manual port forwarding
- Forward UDP port 24454 to your local IP
- Check router documentation for instructions

### STUN Not Working

**Check firewall:**
- Allow UDP traffic to stun.l.google.com:19302
- Check Windows Defender / macOS Firewall settings
- Check antivirus software

**Test STUN manually:**
```bash
# Linux/Mac
nc -u stun.l.google.com 19302

# Windows PowerShell
Test-NetConnection -ComputerName stun.l.google.com -Port 19302
```

### Symmetric NAT Detected

Symmetric NAT is the most restrictive type and may prevent direct connectivity.

**Options:**
1. Try connecting anyway - may still work
2. Manual port forwarding on router
3. Wait for TURN relay support (future feature)

## Security Considerations

### UPnP Security

**Risks:**
- UPnP can be exploited if router has vulnerabilities
- Malware could create unwanted port mappings

**Mitigations in this implementation:**
- Only opens ports when actively connecting
- Removes mappings on disconnect
- Uses specific port (24454) not wildcard
- Temporary mappings only (deleted on exit)

### STUN Privacy

**Privacy notes:**
- STUN reveals your public IP address
- This is necessary for peer-to-peer connectivity
- Data sent to public STUN servers (Google)

**No sensitive data exposed:**
- Only network addressing information
- No usernames, game data, or audio sent to STUN
- STUN used only for initial discovery

## Future Enhancements

### TURN Relay Support (Phase 4)

For users behind symmetric NAT or restrictive firewalls:

1. **Client Changes:**
   - Add TURN client implementation
   - Fallback to relay when direct fails
   - Automatic relay selection

2. **Server Changes:**
   - Deploy TURN relay server(s)
   - Configure relay endpoints
   - Handle relay allocation

3. **Trade-offs:**
   - Higher latency (relay hop)
   - Server bandwidth cost
   - Guaranteed connectivity

### NAT-PMP Support

Alternative to UPnP for Apple/BSD routers:
- Similar to UPnP but simpler protocol
- Common on Apple routers
- Lower overhead than IGD

## Testing

### Test Scenarios

1. **Home Network with UPnP**
   - Expected: Automatic mapping succeeds
   - NAT Type: Moderate or Open

2. **Home Network without UPnP**
   - Expected: STUN succeeds, UPnP fails
   - NAT Type: Strict or Moderate
   - Action: Manual port forwarding needed

3. **Public Network (Coffee Shop)**
   - Expected: STUN succeeds
   - NAT Type: Varies (usually Strict)
   - Action: May not be able to host

4. **Corporate Network**
   - Expected: UPnP blocked, STUN may work
   - NAT Type: Strict or Blocked
   - Action: Use different network

### Manual Testing

1. Connect to voice server
2. Check NAT status label
3. Click "Run NAT Diagnostics"
4. Verify public IP is correct
5. Verify UPnP status matches expectations
6. Test voice connectivity

## References

- [RFC 5389: STUN](https://datatracker.ietf.org/doc/html/rfc5389)
- [UPnP IGD Specification](http://upnp.org/specs/gw/UPnP-gw-WANIPConnection-v1-Service.pdf)
- [NAT Traversal Techniques](https://en.wikipedia.org/wiki/NAT_traversal)
- [goupnp Library](https://github.com/huin/goupnp)
- [pion/stun Library](https://github.com/pion/stun)
