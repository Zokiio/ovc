# Implement Token-Based Authentication

**Priority:** Medium  
**Category:** Security  
**Effort:** Medium

## Problem

Username-only authentication is insecure and lacks protection against impersonation. Competitor solutions use JWT tokens (sekwah41) and OAuth 2.0 (giulienw). We need secure, server-verified authentication.

## Current State
- Client sends username as plain text
- No password or token verification
- Server trusts client-provided identity
- Vulnerable to impersonation

## Proposed Solution

**In-Game Token Generation:**
1. Player runs `/voice` command in Hytale
2. Server generates time-limited JWT token
3. Server displays clickable auth code or QR code
4. Player enters token in voice client
5. Client authenticates with token
6. Token expires after use or timeout (5 minutes)

**Token Format:**
```json
{
  "player_uuid": "...",
  "username": "...",
  "server_id": "...",
  "issued_at": 1234567890,
  "expires_at": 1234567890
}
```

## Implementation Tasks
- [ ] Add JWT library to plugin (java-jwt or jjwt)
- [ ] Generate tokens on `/voice` command
- [ ] Display auth code in chat (6-digit code)
- [ ] Add token input field in Go client
- [ ] Implement token verification on server
- [ ] Add token expiration and refresh
- [ ] Store active tokens in memory/cache
- [ ] Add configuration for token lifetime
- [ ] Update protocol for token-based auth
- [ ] Add rate limiting on token generation

## Acceptance Criteria
- Players authenticate using server-generated tokens
- Tokens expire after 5 minutes
- One-time use tokens (invalidated after auth)
- Server verifies player identity
- Clear error messages for invalid/expired tokens
- Backwards compatibility mode (optional)

## References
- jjwt library: https://github.com/jwtk/jjwt
- sekwah41's token approach in comparison
- Comparison doc section: "Technical Debt & Risks > Security Risks"

## Labels
`security`, `enhancement`
