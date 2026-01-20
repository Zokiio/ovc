# Implement Adaptive Bitrate Control

**Priority:** Low  
**Category:** Audio Quality  
**Effort:** Medium

## Problem

Fixed 12kbps bitrate doesn't adapt to network conditions. High-quality networks are underutilized, while poor networks experience dropouts. Discord uses 8-128kbps adaptive bitrate.

## Current State
- Fixed Opus bitrate (~12kbps)
- No network quality detection
- Same quality for all conditions
- Inefficient bandwidth usage

## Proposed Solution

**Network Quality Detection:**
- Monitor packet loss percentage
- Track round-trip time (RTT)
- Measure jitter
- Calculate quality score (0-100)

**Adaptive Algorithm:**
- Start at medium quality (24kbps)
- Increase bitrate if quality high (low loss, low RTT)
- Decrease bitrate if quality low (high loss, high RTT)
- Adjust every 5-10 seconds
- Range: 8kbps (poor) to 64kbps (excellent)

**Quality Presets:**
- Poor: 8kbps, 20ms frames, no FEC
- Low: 12kbps, 20ms frames, 5% FEC
- Medium: 24kbps, 20ms frames, 10% FEC (default)
- High: 48kbps, 20ms frames, 15% FEC
- Excellent: 64kbps, 10ms frames, 20% FEC

## Implementation Tasks
- [ ] Add network quality monitoring
- [ ] Track packet loss percentage
- [ ] Implement RTT measurement (ping/pong)
- [ ] Calculate quality score algorithm
- [ ] Implement bitrate adjustment logic
- [ ] Add configuration for min/max bitrate
- [ ] Display current bitrate in client UI
- [ ] Add manual quality override option
- [ ] Test with simulated network conditions
- [ ] Add quality statistics to logs

## Acceptance Criteria
- Bitrate adapts to network conditions
- Smooth quality transitions
- No abrupt changes (hysteresis)
- User can override with manual setting
- Current quality visible in UI
- Works with packet loss concealment (Issue #4)

## Configuration Example
```yaml
audio:
  adaptive_bitrate:
    enabled: true
    min_bitrate: 8000
    max_bitrate: 64000
    adjustment_interval: 10s
    quality_thresholds:
      excellent: 100  # 0% loss, <50ms RTT
      high: 80        # <2% loss, <100ms RTT
      medium: 60      # <5% loss, <150ms RTT
      low: 40         # <10% loss, <200ms RTT
      poor: 0         # >10% loss or >200ms RTT
```

## References
- Opus bitrate recommendations: https://wiki.xiph.org/Opus_Recommended_Settings
- Discord's adaptive bitrate
- Comparison doc: "Future Enhancement Opportunities > Adaptive bitrate"

## Labels
`enhancement`, `audio-quality`
