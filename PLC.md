# Packet Loss Concealment (PLC)

This document describes the Packet Loss Concealment implementation in the Hytale Voice Chat system.

## Overview

Packet Loss Concealment (PLC) is a critical feature for maintaining audio quality over unreliable networks. When UDP packets are lost, PLC techniques are used to minimize audio dropouts and provide a smooth listening experience.

## Architecture

### Server-Side (Java Plugin)

**Forward Error Correction (FEC)**
- Opus encoder configured with in-band FEC
- Default setting: 10% expected packet loss
- Configurable range: 0-20%
- Adds redundant data to packets for recovery

**Implementation**: `OpusCodec.java`
```java
OpusCodec codec = new OpusCodec(0.10f); // 10% FEC
codec.setFecPercentage(0.05f); // Update to 5%
```

### Client-Side (Go)

**Sequence Number Tracking**
- Each audio packet includes a sequence number
- Client detects gaps in sequence to identify packet loss
- Out-of-order packets are tracked separately

**Jitter Buffer**
- Reorders packets that arrive out of sequence
- Configurable buffer size: 20-200ms (default: 80ms)
- Uses min-heap for efficient sequence ordering
- Automatically plays oldest packet after minimum delay

**Opus PLC**
- When packet is lost, synthesizes plausible audio frame
- Opus decoder generates audio based on previous frames
- Fallback to silence if PLC fails

**Network Statistics**
- Real-time packet loss percentage
- Jitter measurement (inter-arrival time variation)
- Network quality rating: Excellent/Good/Fair/Poor
- Rolling window for accurate recent statistics

## Usage

### Enabling/Disabling PLC

```go
client := NewVoiceClient()

// PLC is enabled by default
client.SetPLC(false) // Disable PLC (direct playback)
client.SetPLC(true)  // Re-enable PLC
```

### Configuring Jitter Buffer

```go
// Set jitter buffer size in milliseconds
client.SetJitterBufferSize(100) // 100ms buffer
```

Recommended settings:
- Low latency (LAN): 20-40ms
- Normal (Internet): 60-100ms  
- High latency/loss: 120-200ms

### Network Statistics

```go
stats := client.GetNetworkStats()

loss := stats.GetPacketLossPercent()      // 0-100
jitter := stats.GetAverageJitter()        // milliseconds
quality := stats.GetNetworkQuality()      // "Excellent", "Good", "Fair", "Poor"
received := stats.GetTotalPacketsReceived()
lost := stats.GetTotalPacketsLost()
```

### GUI Display

The client GUI automatically displays network statistics:
- Network quality indicator
- Packet loss percentage
- Average jitter
- Total packets received/lost

Updates every 1 second while connected.

## How It Works

### Packet Flow (With PLC Enabled)

1. **Packet Received**
   - Parse sequence number and audio data
   - Record in network statistics
   - Add to jitter buffer

2. **Jitter Buffer Playback** (every 20ms)
   - Check if expected packet is available
   - If available and aged: decode and play
   - If missing: use PLC to synthesize frame
   - If very late: fill gap with PLC, then play late packet

3. **Network Statistics**
   - Track sequence gaps → packet loss count
   - Measure inter-arrival time → jitter
   - Maintain rolling window for recent statistics

### Packet Flow (Without PLC / Legacy)

1. **Packet Received**
   - Parse and decode immediately
   - Play directly (no buffering)
   - Lost packets → silence gaps

## Performance Impact

**FEC Overhead (Server)**
- 5% FEC: ~5-10% bitrate increase
- 10% FEC: ~10-15% bitrate increase  
- 20% FEC: ~15-20% bitrate increase

**Jitter Buffer (Client)**
- Memory: ~10-100 KB (buffer size dependent)
- CPU: Minimal (heap operations)
- Latency: Adds buffer size to audio delay (e.g., 80ms)

## Testing

### Simulating Packet Loss

```bash
# Linux: use tc (traffic control) to add packet loss
sudo tc qdisc add dev eth0 root netem loss 10%

# Verify with ping
ping -c 100 server.example.com

# Remove packet loss simulation
sudo tc qdisc del dev eth0 root
```

### Observing PLC in Action

1. Connect to voice server
2. Monitor network statistics in GUI
3. Simulate packet loss (network tool or unstable connection)
4. Observe:
   - Packet loss percentage increases
   - Audio remains relatively smooth
   - Network quality indicator updates

## Acceptance Criteria (Verified)

✅ Graceful handling of 5-10% packet loss  
✅ Smooth audio with occasional dropouts  
✅ FEC increases bitrate by <20%  
✅ Network stats visible in client UI  
✅ Configurable jitter buffer size  

## Future Enhancements

- [ ] Adaptive jitter buffer (auto-adjust based on network conditions)
- [ ] FEC configuration in server settings
- [ ] More detailed network statistics (bandwidth, latency)
- [ ] Packet loss visualization graph
- [ ] Per-user network quality monitoring (server-side)

## References

- [Opus Codec Documentation](https://opus-codec.org/docs/)
- [Opus FEC API](https://opus-codec.org/docs/opus_api-1.3.1/group__opus__decoder.html)
- [opus4j Library](https://github.com/henkelmax/opus4j)
- [hraban/opus.v2 (Go)](https://github.com/hraban/opus)
