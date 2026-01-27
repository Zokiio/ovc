# Hytale Voice Chat Protocol Documentation

This document provides a complete specification of the UDP packet protocol used by the Hytale Voice Chat plugin. Use this guide to build your own voice client that can communicate with the plugin.

---

## Table of Contents

- [Overview](#overview)
- [Connection Information](#connection-information)
- [Data Types](#data-types)
- [Packet Types](#packet-types)
- [Packet Format Specifications](#packet-format-specifications)
- [Communication Flow](#communication-flow)
- [Audio Codec Support](#audio-codec-support)
- [Implementation Examples](#implementation-examples)
- [Security Considerations](#security-considerations)

---

## Overview

The Hytale Voice Chat plugin uses a custom UDP-based protocol for voice communication. All packets follow a simple structure with a 1-byte packet type identifier followed by packet-specific data.

**Key Features:**
- UDP-based for low latency
- Proximity-based audio routing (default: 30 blocks)
- Support for PCM and Opus codecs
- Optional group-based voice channels
- Privacy mode with hash IDs instead of UUIDs

---

## Connection Information

- **Default Port:** `24454` (UDP)
- **Protocol:** Custom binary over UDP
- **Byte Order:** Big-endian (network byte order)
- **String Encoding:** UTF-8

---

## Data Types

All multi-byte values use **big-endian** byte order:

| Type | Size | Description |
|------|------|-------------|
| `byte` | 1 byte | Single byte value |
| `short` | 2 bytes | 16-bit signed integer |
| `int` | 4 bytes | 32-bit signed integer |
| `float` | 4 bytes | IEEE 754 floating-point |
| `long` | 8 bytes | 64-bit signed integer |
| `UUID` | 16 bytes | Two longs (MSB + LSB) |
| `string` | variable | Length prefix (2 or 4 bytes) + UTF-8 bytes |

---

## Packet Types

| Type | Code | Direction | Description |
|------|------|-----------|-------------|
| **Authentication** | `0x01` | Client → Server | Initial client authentication with username |
| **Audio** | `0x02` | Bidirectional | Voice data with optional positional info |
| **Auth Acknowledgment** | `0x03` | Server → Client | Authentication response (accept/reject) |
| **Disconnect** | `0x04` | Client → Server | Client disconnect notification |
| **Test Audio** | `0x05` | Client → Server | Audio broadcast test (no positional filtering) |
| **Group Management** | `0x06` | Client → Server | Create/join/leave voice groups |
| **Group State** | `0x07` | Server → Client | Group membership synchronization |
| **Group List** | `0x08` | Bidirectional | Query/response for available groups |
| **Server Shutdown** | `0x09` | Server → Client | Server shutdown notification |
| **Disconnect Ack** | `0x0A` | Server → Client | Disconnect acknowledgment |
| **Player Name** | `0x0B` | Server → Client | Maps hash IDs to usernames |

---

## Packet Format Specifications

### 0x01 - Authentication Packet

**Direction:** Client → Server  
**Purpose:** Authenticate client with username and request sample rate

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x01
1      | 16   | Client UUID        | Randomly generated client identifier
17     | 4    | Username Length    | Length of username string in bytes
21     | var  | Username           | UTF-8 encoded username
21+n   | 4    | Requested Sample   | Audio sample rate in Hz (e.g., 48000)
       |      | Rate               | Optional for backward compatibility
```

**Java Example:**
```java
ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 4 + usernameBytes.length + 4);
buffer.put((byte) 0x01);
buffer.putLong(clientId.getMostSignificantBits());
buffer.putLong(clientId.getLeastSignificantBits());
buffer.putInt(usernameBytes.length);
buffer.put(usernameBytes);
buffer.putInt(48000); // Requested sample rate
```

**Notes:**
- The `requestedSampleRate` field is optional for backward compatibility
- Supported sample rates: 8000, 12000, 16000, 24000, 48000 Hz
- Default sample rate: 48000 Hz if not specified

---

### 0x02 - Audio Packet

**Direction:** Bidirectional  
**Purpose:** Transmit encoded audio data with optional position information

#### Standard Format (without position):
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x02
1      | 1    | Codec Byte         | Bit 7: position flag, Bits 0-6: codec
2      | 16   | Sender UUID        | Sender's client identifier
18     | 4    | Sequence Number    | Packet sequence number
22     | 4    | Audio Data Length  | Length of audio data in bytes
26     | var  | Audio Data         | Encoded audio (PCM or Opus)
```

#### With Position (bit 7 of Codec Byte set):
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x02
1      | 1    | Codec Byte         | 0x80 | codec_type
2      | 16   | Sender UUID        | Sender's client identifier
18     | 4    | Sequence Number    | Packet sequence number
22     | 4    | Audio Data Length  | Length of audio data in bytes
26     | var  | Audio Data         | Encoded audio (PCM or Opus)
26+n   | 4    | Position X         | X coordinate (float)
30+n   | 4    | Position Y         | Y coordinate (float)
34+n   | 4    | Position Z         | Z coordinate (float)
```

#### Hash ID Variant (privacy mode):
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x02
1      | 1    | Codec Byte         | Bit 7: position flag, Bits 0-6: codec
2      | 4    | Hash ID            | 4-byte sender identifier
6      | 4    | Sequence Number    | Packet sequence number
10     | 4    | Audio Data Length  | Length of audio data in bytes
14     | var  | Audio Data         | Encoded audio (PCM or Opus)
14+n   | 12   | Position (opt)     | X, Y, Z coordinates (3 floats)
```

**Codec Byte Format:**
- Bit 7 (0x80): Position flag (1 = position data included)
- Bits 0-6: Codec type
  - `0x00` = PCM (uncompressed)
  - `0x01` = Opus (compressed)

**Java Example:**
```java
ByteBuffer buffer = ByteBuffer.allocate(26 + audioData.length + (hasPosition ? 12 : 0));
byte codecByte = AudioCodec.OPUS; // 0x01
if (hasPosition) {
    codecByte |= 0x80; // Set position flag
}
buffer.put((byte) 0x02);
buffer.put(codecByte);
buffer.putLong(senderId.getMostSignificantBits());
buffer.putLong(senderId.getLeastSignificantBits());
buffer.putInt(sequenceNumber);
buffer.putInt(audioData.length);
buffer.put(audioData);
if (hasPosition) {
    buffer.putFloat(posX);
    buffer.putFloat(posY);
    buffer.putFloat(posZ);
}
```

---

### 0x03 - Authentication Acknowledgment Packet

**Direction:** Server → Client  
**Purpose:** Respond to authentication request with accept/reject status

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x03
1      | 16   | Client UUID        | Client identifier being acknowledged
17     | 1    | Rejection Reason   | 0=accepted, >0=rejection code
18     | 2    | Message Length     | Length of message string in bytes
20     | var  | Message            | UTF-8 encoded status message
20+n   | 4    | Selected Sample    | Server-selected sample rate in Hz
       |      | Rate               | Optional for backward compatibility
```

**Rejection Reason Codes:**
- `0x00` = ACCEPTED
- `0x01` = PLAYER_NOT_FOUND (player not in-game)
- `0x02` = SERVER_NOT_READY (server initializing)
- `0x03` = INVALID_CREDENTIALS

**Java Example:**
```java
ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 1 + 2 + messageBytes.length + 4);
buffer.put((byte) 0x03);
buffer.putLong(clientId.getMostSignificantBits());
buffer.putLong(clientId.getLeastSignificantBits());
buffer.put((byte) 0x00); // ACCEPTED
buffer.putShort((short) messageBytes.length);
buffer.put(messageBytes);
buffer.putInt(48000); // Selected sample rate
```

---

### 0x04 - Disconnect Packet

**Direction:** Client → Server  
**Purpose:** Notify server of client disconnect

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x04
1      | 16   | Client UUID        | Client identifier disconnecting
```

**Java Example:**
```java
ByteBuffer buffer = ByteBuffer.allocate(17);
buffer.put((byte) 0x04);
buffer.putLong(clientId.getMostSignificantBits());
buffer.putLong(clientId.getLeastSignificantBits());
```

---

### 0x05 - Test Audio Packet

**Direction:** Client → Server  
**Purpose:** Send test audio that broadcasts to all connected clients (no proximity filtering)

**Format:** Same as Audio Packet (0x02), but server broadcasts to all clients regardless of position.

---

### 0x06 - Group Management Packet

**Direction:** Client → Server  
**Purpose:** Manage voice groups (create, join, leave, update settings)

#### CREATE Operation:
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x06
1      | 16   | Player UUID        | Player creating the group
17     | 1    | Operation Type     | 0x01 (CREATE)
18     | 1    | Is Permanent       | 0x01=permanent, 0x00=temporary
19     | 2    | Group Name Length  | Length of group name in bytes
21     | var  | Group Name         | UTF-8 encoded group name (max 32 bytes)
```

#### JOIN / LEAVE Operations:
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x06
1      | 16   | Player UUID        | Player joining/leaving
17     | 1    | Operation Type     | 0x02 (JOIN) or 0x03 (LEAVE)
18     | 16   | Group UUID         | Target group identifier
```

#### UPDATE_SETTINGS Operation:
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x06
1      | 16   | Player UUID        | Player updating settings
17     | 1    | Operation Type     | 0x04 (UPDATE_SETTINGS)
18     | 16   | Group UUID         | Target group identifier
34     | 1    | Is Isolated        | 0x01=isolated, 0x00=not isolated
```

**Operation Types:**
- `0x01` = CREATE - Create a new voice group
- `0x02` = JOIN - Join an existing group
- `0x03` = LEAVE - Leave a group
- `0x04` = UPDATE_SETTINGS - Update group settings (e.g., isolation mode)

**Isolation Mode:** When enabled, only group members can hear each other.

---

### 0x07 - Group State Packet

**Direction:** Server → Client  
**Purpose:** Synchronize group membership and settings to client

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x07
1      | 16   | Server UUID        | Server identifier
17     | 16   | Group UUID         | Group identifier
33     | 2    | Group Name Length  | Length of group name in bytes
35     | var  | Group Name         | UTF-8 encoded group name
35+n   | 2    | Member Count       | Number of members in group
37+n   | 16*m | Member UUIDs       | Array of member UUIDs
       | 16   | Creator UUID       | Group creator's UUID
       | 1    | Is Isolated        | 0x01=isolated, 0x00=not isolated
```

---

### 0x08 - Group List Packet

**Direction:** Bidirectional  
**Purpose:** Query and respond with available groups

#### Query (Client → Server):
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x08
1      | 16   | Client UUID        | Client making the query
17     | 1    | Is Query           | 0x01 (query flag)
```

#### Response (Server → Client):
```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x08
1      | 16   | Server UUID        | Server identifier
17     | 1    | Is Response        | 0x00 (response flag)
18     | 2    | Group Count        | Number of groups
20     | var  | Group Data         | Array of group information

Each Group Entry:
- Group UUID (16 bytes)
- Name Length (2 bytes)
- Group Name (variable, UTF-8)
- Member Count (4 bytes)
```

---

### 0x09 - Server Shutdown Packet

**Direction:** Server → Client  
**Purpose:** Notify clients of graceful server shutdown

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x09
1      | 2    | Reason Length      | Length of reason string (max 1024)
3      | var  | Reason             | UTF-8 encoded shutdown reason
```

---

### 0x0A - Disconnect Acknowledgment Packet

**Direction:** Server → Client  
**Purpose:** Acknowledge client disconnect request

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x0A
1      | 16   | Client UUID        | Client being disconnected
17     | 4    | Reason Length      | Length of reason string in bytes
21     | var  | Reason             | UTF-8 encoded disconnect reason
```

---

### 0x0B - Player Name Packet

**Direction:** Server → Client  
**Purpose:** Map hash IDs to usernames for privacy mode display

```
Offset | Size | Field              | Description
-------+------+--------------------+----------------------------------
0      | 1    | Packet Type        | 0x0B
1      | 16   | Server UUID        | Server identifier
17     | 4    | Hash ID            | 4-byte player hash identifier
21     | 4    | Username Length    | Length of username string
25     | var  | Username           | UTF-8 encoded username (max 256 bytes)
```

**Java Example:**
```java
ByteBuffer buffer = ByteBuffer.allocate(1 + 16 + 4 + 4 + usernameBytes.length);
buffer.put((byte) 0x0B);
buffer.putLong(serverId.getMostSignificantBits());
buffer.putLong(serverId.getLeastSignificantBits());
buffer.putInt(hashId);
buffer.putInt(usernameBytes.length);
buffer.put(usernameBytes);
```

---

## Communication Flow

### 1. Connection Handshake

```
1. Client generates random UUID
2. Client → Server: AuthenticationPacket (0x01)
   - Includes username and requested sample rate
3. Server validates player is in-game
4. Server → Client: AuthAckPacket (0x03)
   - ACCEPTED or rejection code
5. Server → Client: PlayerNamePacket (0x0B) for existing players
6. Server broadcasts new player's PlayerNamePacket to others
```

### 2. Audio Streaming

```
Continuous loop while connected:

1. Client captures audio from microphone
2. Client encodes audio (PCM or Opus)
3. Client → Server: AudioPacket (0x02)
   - With or without position data
4. Server checks proximity/groups
5. Server → Nearby Clients: AudioPacket (0x02)
   - Only to clients within range or same group
6. Clients decode and play audio
```

### 3. Group Management (Optional)

```
1. Client → Server: GroupManagementPacket (0x06)
   - Operation: CREATE, JOIN, LEAVE, or UPDATE_SETTINGS
2. Server processes request
3. Server → All Group Members: GroupStatePacket (0x07)
   - Updates membership and settings
```

### 4. Disconnection

```
1. Client → Server: DisconnectPacket (0x04)
2. Server cleans up client resources
3. Server → Client: DisconnectAckPacket (0x0A)
4. Server broadcasts player removal to remaining clients
```

### 5. Server Shutdown

```
1. Server initiates shutdown
2. Server → All Clients: ServerShutdownPacket (0x09)
3. Clients disconnect gracefully
```

---

## Audio Codec Support

### PCM (0x00)
- **Format:** Uncompressed raw audio
- **Sample Rate:** 8000-48000 Hz (default: 48000 Hz)
- **Bit Depth:** 16-bit signed integers
- **Channels:** Mono
- **Frame Size:** 960 samples at 48kHz (20ms)

### Opus (0x01)
- **Format:** Opus compressed audio
- **Sample Rate:** 48000 Hz
- **Frame Duration:** 20ms
- **Frame Size:** 960 samples
- **Bitrate:** Variable (typically 24-32 kbps for voice)
- **Channels:** Mono

**Recommended:** Use Opus for bandwidth efficiency. PCM is mainly for testing.

---

## Implementation Examples

### Minimal Voice Client Implementation

A minimal voice client needs to implement:

1. **UDP Socket** - Connect to server on port 24454
2. **Authentication** - Send packet 0x01, receive 0x03
3. **Audio Streaming** - Send/receive packet 0x02
4. **Disconnection** - Send packet 0x04

### Pseudo-code Example:

```
// 1. Setup
socket = createUDPSocket()
clientId = generateRandomUUID()
serverAddress = "server_ip:24454"

// 2. Authenticate
authPacket = createAuthenticationPacket(clientId, username, 48000)
send(socket, authPacket, serverAddress)
authAck = receive(socket)
if (authAck.rejectionReason != 0) {
    print("Authentication failed: " + authAck.message)
    exit()
}

// 3. Audio Loop
sequenceNumber = 0
while (connected) {
    // Capture and encode audio
    audioData = captureAndEncodeMicrophone()
    
    // Send audio packet
    audioPacket = createAudioPacket(clientId, OPUS, audioData, sequenceNumber++)
    send(socket, audioPacket, serverAddress)
    
    // Receive and play audio from others
    while (hasData(socket)) {
        incomingPacket = receive(socket)
        if (incomingPacket.type == 0x02) {
            decodedAudio = decodeAudio(incomingPacket.audioData)
            playSpeaker(decodedAudio)
        }
    }
}

// 4. Disconnect
disconnectPacket = createDisconnectPacket(clientId)
send(socket, disconnectPacket, serverAddress)
```

### UUID Serialization Helper

```java
// Serialize UUID to bytes
public static void writeUUID(ByteBuffer buffer, UUID uuid) {
    buffer.putLong(uuid.getMostSignificantBits());
    buffer.putLong(uuid.getLeastSignificantBits());
}

// Deserialize UUID from bytes
public static UUID readUUID(ByteBuffer buffer) {
    long msb = buffer.getLong();
    long lsb = buffer.getLong();
    return new UUID(msb, lsb);
}
```

### Packet Type Detection

```java
public static byte getPacketType(byte[] data) {
    if (data == null || data.length < 1) {
        throw new IllegalArgumentException("Invalid packet data");
    }
    return data[0];
}
```

---

## Security Considerations

### Current Implementation

⚠️ **WARNING:** The current protocol has minimal security:

- **No encryption** - All data sent in plaintext
- **No authentication** - Anyone can claim any username
- **No validation** - Packets are not signed or verified

### Recommended Enhancements

For production use, consider:

1. **DTLS (Datagram TLS)** - Encrypt UDP traffic
2. **Shared Secret** - Server generates token for player authentication
3. **Rate Limiting** - Prevent flooding attacks
4. **IP Whitelisting** - Only allow connections from trusted sources
5. **Packet Signing** - HMAC to verify packet authenticity

### Privacy Mode

The protocol supports **hash ID mode** where 4-byte hash IDs replace 16-byte UUIDs in audio packets:

- Reduces packet size by 12 bytes
- Protects player identity from packet sniffing
- Server sends PlayerNamePacket (0x0B) to map hash IDs to usernames

---

## Testing Your Implementation

### 1. Test Authentication

```bash
# Expected: Receive 0x03 packet with reason=0x00 (ACCEPTED)
Send: 0x01 + ClientUUID + UsernameLength + "TestPlayer" + 48000
```

### 2. Test Audio Echo

```bash
# Expected: Receive your own audio back if you're within proximity range
Send: 0x02 + CodecByte + ClientUUID + SeqNum + AudioDataLength + AudioData
```

### 3. Test Disconnect

```bash
# Expected: Receive 0x0A acknowledgment
Send: 0x04 + ClientUUID
```

### Debug Tips

- Use Wireshark to inspect UDP packets on port 24454
- Check packet type byte (offset 0) matches expected value
- Verify UUID byte order (big-endian)
- Ensure string lengths match actual data
- Test with both PCM and Opus codecs

---

## Additional Resources

- **Setup Guide:** [SETUP.md](SETUP.md)
- **Authentication Details:** [AUTHENTICATION.md](AUTHENTICATION.md)
- **Testing Procedures:** [TEST.md](TEST.md)
- **Audio Testing:** [AUDIO_TESTING.md](AUDIO_TESTING.md)

---

## Support

For questions or issues:
- Check existing documentation in `hytale-plugin/docs/`
- Review the Java reference implementation in `hytale-plugin/common/src/main/java/com/hytale/voicechat/common/packet/`
- Examine the Go client implementation in `voice-client/internal/client/`

---

**Last Updated:** 2026-01-27  
**Protocol Version:** 1.0.0  
**Compatible with:** Hytale Voice Chat Plugin 1.0.0-SNAPSHOT
