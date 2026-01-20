# Voice-to-Player Linking Test Scenario

## Setup
1. Hytale server running with voice plugin
2. Two players in-game: "Steve" and "Alex"
3. Both players run voice clients on their desktops

## Step-by-Step Flow

### 1. Steve Joins Hytale Server
```
Hytale Server:
- Steve spawns at (100, 64, 200)
- PlayerEventListener.onPlayerJoin() called
- Hytale player UUID: 123e4567-e89b-12d3-a456-426614174000
- usernameToPlayerUUID["Steve"] = 123e4567...
- positionTracker updates: Steve @ (100, 64, 200)
```

### 2. Alex Joins Hytale Server
```
Hytale Server:
- Alex spawns at (110, 64, 210)
- PlayerEventListener.onPlayerJoin() called  
- Hytale player UUID: 987fcdeb-51a2-43f7-8945-abcdef123456
- usernameToPlayerUUID["Alex"] = 987fcdeb...
- positionTracker updates: Alex @ (110, 64, 210)
```

### 3. Steve Opens Voice Client
```
Voice Client (Steve's computer):
- GUI opens
- Username field: "Steve" (user enters manually)
- Server: localhost:24454
- [Connect] clicked
```

### 4. Steve's Voice Client Authenticates
```
Voice Client -> Plugin:
AuthenticationPacket {
    clientId: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee (random)
    username: "Steve"
}

Plugin receives:
- usernameToClientUUID["Steve"] = aaaaaaaa-bbbb...
- clients[aaaaaaaa-bbbb...] = 192.168.1.100:54321
- eventListener.getPlayerUUID("Steve") = 123e4567... (Hytale UUID)
- clientToPlayerUUID[aaaaaaaa-bbbb...] = 123e4567...

Log: "Client authenticated: Steve (client UUID: aaaaaaaa, player UUID: 123e4567) from 192.168.1.100:54321"
```

### 5. Alex Opens Voice Client  
```
Voice Client (Alex's computer):
- GUI opens
- Username: "Alex"
- Server: localhost:24454
- [Connect] clicked

Voice Client -> Plugin:
AuthenticationPacket {
    clientId: ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj
    username: "Alex"
}

Plugin:
- usernameToClientUUID["Alex"] = ffffffff-gggg...
- clientToPlayerUUID[ffffffff-gggg...] = 987fcdeb...
```

### 6. Steve Speaks (Sends Audio)
```
Voice Client -> Plugin:
AudioPacket {
    clientId: aaaaaaaa-bbbb... (Steve's client)
    audioData: [Opus-encoded bytes]
    sequenceNumber: 1
}

Plugin routing logic:
1. Get Steve's client UUID: aaaaaaaa-bbbb...
2. Map to player UUID: 123e4567... (Steve's Hytale player)
3. Get Steve's position: (100, 64, 200)
4. For each other player:
   - Alex @ (110, 64, 210)
   - Distance = sqrt((110-100)² + (64-64)² + (210-200)²) = 14.14 blocks
   - 14.14 < 30 blocks → SEND
5. Find Alex's voice client UUID: ffffffff-gggg...
6. Get Alex's network address: 192.168.1.100:54322
7. Forward audio packet to Alex's voice client

Log: "Routed audio from Steve to 1 nearby players"
```

### 7. Steve Moves Far Away
```
Steve walks to (200, 64, 300)
PlayerEventListener.onPlayerMove() called
positionTracker updates: Steve @ (200, 64, 300)

Steve speaks again:
- Distance to Alex = sqrt((200-110)² + (64-64)² + (300-210)²) = 134.5 blocks
- 134.5 > 30 blocks → DON'T SEND

Log: "Routed audio from Steve to 0 nearby players"
```

## Data Structure State

After both clients connect:

```java
// Voice server tracking
clients = {
    aaaaaaaa-bbbb... -> 192.168.1.100:54321,  // Steve's client
    ffffffff-gggg... -> 192.168.1.100:54322   // Alex's client
}

usernameToClientUUID = {
    "Steve" -> aaaaaaaa-bbbb...,
    "Alex" -> ffffffff-gggg...
}

clientToPlayerUUID = {
    aaaaaaaa-bbbb... -> 123e4567...,  // Steve's voice -> Steve's player
    ffffffff-gggg... -> 987fcdeb...   // Alex's voice -> Alex's player
}

// Event listener tracking
eventListener.usernameToPlayerUUID = {
    "Steve" -> 123e4567...,
    "Alex" -> 987fcdeb...
}

// Position tracker
positionTracker.playerPositions = {
    123e4567... -> PlayerPosition("Steve", 100, 64, 200),
    987fcdeb... -> PlayerPosition("Alex", 110, 64, 210)
}
```

## Failure Scenarios

### Voice Client Connects Before Player Joins
```
1. Steve opens voice client first
2. Sends AuthenticationPacket with username "Steve"
3. eventListener.getPlayerUUID("Steve") returns null
4. clientToPlayerUUID not populated
5. Log: "Client authenticated: Steve (client UUID: xxx) - Player not in game!"
6. Audio will broadcast to all (fallback mode)
7. When Steve joins server later, eventListener updates but link not auto-established
   - TODO: Add periodic re-linking check
```

### Wrong Username
```
1. Steve in-game as "Steve"
2. Opens voice client with username "Bob"
3. Voice client can't link to any player
4. Audio broadcast to all (no proximity filtering)
```

### Player Disconnects But Voice Client Stays
```
1. Steve quits Hytale server
2. eventListener.onPlayerQuit() called
3. usernameToPlayerUUID["Steve"] removed
4. positionTracker.removePlayer(123e4567...)
5. Voice client still connected
6. Audio routing fails (no position found)
7. TODO: Send disconnect message to voice client
```

## Next Steps

1. **Auto-reconnect**: If player joins after voice client, re-establish link
2. **Disconnection sync**: Close voice connection when player leaves
3. **Username validation**: Require exact match (case-sensitive?)
4. **Multi-world support**: Filter by world ID in proximity check
5. **Security**: Add authentication token to prevent spoofing
