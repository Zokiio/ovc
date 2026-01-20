# Add Admin/Moderation Features

**Priority:** Low  
**Category:** Feature  
**Effort:** Low-Medium

## Problem

No administrative controls for server operators. Moderators cannot mute disruptive users, monitor activity, or manage voice channels. Essential for public servers.

## Current State
- No admin commands
- Cannot mute/kick users
- No activity monitoring
- No permission system

## Proposed Solution

**Admin Commands:**
- `/voice mute <player>` - Mute player's microphone (server-side)
- `/voice unmute <player>` - Unmute player
- `/voice kick <player>` - Disconnect player from voice
- `/voice ban <player>` - Ban player from voice chat
- `/voice list` - List connected voice clients
- `/voice stats` - Show server statistics
- `/voice reload` - Reload configuration

**Permissions:**
- `hytale.voicechat.admin` - Full admin access
- `hytale.voicechat.moderator` - Mute/kick only
- `hytale.voicechat.use` - Use voice chat

**Features:**
- Server-side mute (block packets from player)
- Kick (disconnect client, allow reconnect)
- Ban (persistent, prevents reconnection)
- Activity log (join/leave/mute events)
- Statistics (bandwidth, users, uptime)

## Implementation Tasks
- [ ] Create admin command handler
- [ ] Implement server-side mute (drop packets)
- [ ] Implement kick functionality
- [ ] Add persistent ban list (file/database)
- [ ] Add permission checks
- [ ] Implement `/voice list` with online users
- [ ] Add statistics tracking
- [ ] Create activity log
- [ ] Add admin notifications (chat messages)
- [ ] Update documentation with commands

## Acceptance Criteria
- Moderators can mute/kick disruptive users
- Mute persists across reconnections
- Ban list persists server restart
- Commands respect permissions
- Activity logged to file
- Statistics accurate and useful

## Command Examples
```
/voice list
  Players online: 5
  - Steve (192.168.1.100) - 12.3kbps
  - Alex (192.168.1.101) - 11.8kbps [MUTED]
  
/voice stats
  Uptime: 2h 34m
  Total connections: 23
  Current users: 5
  Bandwidth: 61.5kbps
  Packets/sec: 250
  
/voice mute Steve
  Steve has been muted by admin.
```

## References
- Comparison doc: "Future Enhancement Opportunities > Admin features"

## Labels
`enhancement`, `feature`
