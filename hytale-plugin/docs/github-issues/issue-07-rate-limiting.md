# Implement Rate Limiting and DoS Protection

**Priority:** Medium  
**Category:** Security  
**Effort:** Low-Medium

## Problem

No rate limiting or DoS protection makes server vulnerable to abuse. Malicious clients could flood server with packets, impacting legitimate users.

## Current State
- No connection limits
- No rate limiting on authentication
- No packet rate limiting
- No bandwidth throttling
- Vulnerable to amplification attacks

## Proposed Solution

**Connection Limits:**
- Max connections per IP
- Max total connections
- Connection timeout for inactive clients

**Rate Limiting:**
- Max authentication attempts per IP (5/minute)
- Max audio packets per second per client (100/s)
- Max bandwidth per client (50 kbps)
- Global bandwidth cap

**Protection Mechanisms:**
- Block IPs after failed auth attempts
- Detect and disconnect flooding clients
- Configurable whitelist/blacklist
- Graceful degradation under load

## Implementation Tasks
- [ ] Add connection tracking per IP
- [ ] Implement token bucket rate limiter
- [ ] Add max connections configuration
- [ ] Track packet rates per client
- [ ] Implement bandwidth throttling
- [ ] Add IP blacklist/whitelist
- [ ] Log suspicious activity
- [ ] Add admin commands to view/manage limits
- [ ] Add metrics for monitoring
- [ ] Configure reasonable defaults

## Acceptance Criteria
- Server handles 1000+ auth attempts gracefully
- Flooding clients auto-disconnected
- Legitimate users unaffected by abuse
- Configurable limits in plugin config
- Admin commands to manage restrictions
- Metrics exposed for monitoring

## Configuration Example
```yaml
security:
  max_connections_global: 100
  max_connections_per_ip: 3
  auth_rate_limit: 5/minute
  packet_rate_limit: 100/second
  bandwidth_per_client: 50kbps
  auto_ban_threshold: 10
  ban_duration: 300
```

## References
- Comparison doc: "Technical Debt & Risks > Security Risks"
- Guava RateLimiter: https://github.com/google/guava/wiki/RateLimiterExplained

## Labels
`security`, `enhancement`
