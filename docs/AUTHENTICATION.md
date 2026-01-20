# Authentication Flow

## How Voice Clients Link to In-Game Players

### 1. Player Joins Hytale Server
```
Player "Steve" joins server → Plugin assigns/tracks UUID
```

### 2. Voice Client Connects
```
Desktop App:
- User enters username: "Steve"
- Connects to server (localhost:24454)
- Generates random client UUID
```

### 3. Authentication Packet Sent
```java
AuthenticationPacket {
    packetType: 0x01
    clientId: UUID (randomly generated)
    username: "Steve"
}
```

### 4. Server Processes Authentication
```
UDPSocketManager receives packet:
1. Deserializes AuthenticationPacket
2. Registers: clients[clientId] = InetSocketAddress
3. Maps: usernameToUUID["Steve"] = clientId
4. Logs: "Client authenticated: Steve (UUID: xyz) from 192.168.1.100:54321"
```

### 5. Audio Packets Flow
```java
AudioPacket {
    packetType: 0x02
    senderId: UUID (from authentication)
    audioData: byte[]
    sequenceNumber: int
}
```

### 6. Proximity-Based Routing
```
Server checks:
1. Is client registered? (clients.containsKey(senderId))
2. Get sender position: positionTracker.getPlayerPosition(senderId)
3. Calculate distance to all other players
4. Forward audio only to players within 30 blocks
```

## Implementation Details

### Packet Types
- `0x01` - Authentication (username → UUID mapping)
- `0x02` - Audio data (voice packets)

### Server-Side Tracking
```java
Map<UUID, InetSocketAddress> clients;        // clientId -> network address
Map<String, UUID> usernameToUUID;            // username -> clientId
Map<UUID, PlayerPosition> playerPositions;   // player -> in-game position
```

### Client Workflow
```
1. User opens voice client
2. Enters username (must match Hytale username)
3. Clicks Connect
4. Client sends AuthenticationPacket
5. Client waits for ack (TODO)
6. Client starts streaming audio via AudioPackets
```

### Linking In-Game Player to Voice Client

**Current Implementation:**
- Voice client uses **username** to identify itself
- Server maps `username → client UUID → network address`
- Position tracker uses **player UUID** (from Hytale API)
- For routing, server needs to link `client UUID ↔ player UUID`

**Future Enhancement Needed:**
When player joins Hytale server, plugin should:
1. Get player's Hytale UUID from API
2. Store: `usernameToPlayerUUID["Steve"] = hytale-player-uuid`
3. When voice client authenticates with "Steve":
   - Link: `clientUUID → "Steve" → hytalePlayerUUID`
   - Track positions by `hytalePlayerUUID`
   - Route audio using this mapping

## Security Considerations

**Current:** No authentication - anyone can claim any username
**Future Options:**
1. **Shared secret** - Server generates token, player enters it in voice client
2. **Plugin integration** - Voice client reads token from Hytale config file
3. **Web authentication** - OAuth/JWT tokens
4. **IP whitelist** - Only allow connections from same machine/network

## Example Usage

### Voice Client
```
Username: Steve
Server: localhost
Port: 24454
[Connect] → Sends AuthenticationPacket
```

### Server Logs
```
INFO: Client authenticated: Steve (UUID: 123e4567-e89b) from 127.0.0.1:54321
INFO: Routing audio from Steve to 3 nearby players
```

### Proximity Logic
```
Steve at (100, 64, 200)
Alex at (110, 64, 210) → distance = 14.14 blocks → SEND
Bob at (200, 64, 300) → distance = 141.42 blocks → SKIP (>30 blocks)
```
