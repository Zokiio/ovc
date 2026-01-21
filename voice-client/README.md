# Hytale Voice Chat - Go Client

A lightweight voice chat client for Hytale written in Go.

## Building

### Prerequisites
- Go 1.24+
- PortAudio development libraries
  - **macOS**: `brew install portaudio`
  - **Windows (MSYS2)**:
    - Install MSYS2 from https://www.msys2.org/
    - Open **MSYS2 MINGW64** and run:
      - `pacman -Syu`
      - `pacman -S --needed mingw-w64-x86_64-toolchain mingw-w64-x86_64-pkg-config mingw-w64-x86_64-portaudio`
  - **Linux**: `apt-get install portaudio19-dev`

### Build for current platform
```bash
go build -o HytaleVoiceChat ./cmd/voice-client
```

### Build for Windows (from macOS/Linux)
```bash
GOOS=windows GOARCH=amd64 go build -o HytaleVoiceChat.exe ./cmd/voice-client
```

### Build for Windows (GUI, no console window)
```powershell
$env:Path="C:\msys64\mingw64\bin;$env:Path"
$env:PKG_CONFIG="C:\msys64\mingw64\bin\pkg-config.exe"
$env:CGO_ENABLED=1
go build -ldflags="-H=windowsgui" -o HytaleVoiceChat.exe ./cmd/voice-client
```

### Build for macOS
```bash
go build -o HytaleVoiceChat ./cmd/voice-client
```

### Build for Linux
```bash
go build -o HytaleVoiceChat ./cmd/voice-client
```

## Running

```bash
./HytaleVoiceChat
```

Or on Windows:
```bash
HytaleVoiceChat.exe
```

## Config and Logs

The client saves settings to JSON in the user config directory:

- **Windows**: `%AppData%\hytale-voicechat\client.json`
- **macOS**: `~/Library/Application Support/hytale-voicechat/client.json`
- **Linux**: `~/.config/hytale-voicechat/client.json`

Logs are written to:

- **Windows**: `%AppData%\hytale-voicechat\logs\client.log`
- **macOS**: `~/Library/Application Support/hytale-voicechat/logs/client.log`
- **Linux**: `~/.config/hytale-voicechat/logs/client.log`

## Features

- ✅ Lightweight GUI built with Fyne
- ✅ UDP audio streaming
- ✅ Microphone and speaker selection
- ✅ Config persistence for server, username, and devices
- ✅ Opus codec support
- ✅ Cross-platform (Windows, macOS, Linux)
- ✅ Single executable (no Java required!)
- ✅ Real-time audio capture and playback (48kHz, 16-bit, mono)
- ✅ Full-duplex streaming (simultaneous send/receive)
- ✅ **NAT Traversal (UPnP & STUN)** - Automatic port forwarding and public IP discovery
- ✅ **NAT Type Detection** - Displays connection quality (Open/Moderate/Strict/Symmetric)
- ✅ **Connection Diagnostics** - Built-in network diagnostic tools

## NAT Traversal & Network Setup

The voice client now includes automatic NAT traversal to eliminate the need for manual port forwarding!

### Automatic Features

**UPnP Port Mapping:**
- Automatically configures port forwarding on UPnP-enabled routers
- Enabled by default, can be disabled in settings
- No router configuration needed for most home networks

**STUN Discovery:**
- Automatically discovers your public IP and port
- Detects NAT type (Open, Moderate, Strict, or Symmetric)
- Uses Google's public STUN servers by default

### Using NAT Traversal

1. **Enable in Settings** (enabled by default):
   - ✅ Enable UPnP Port Mapping
   - ✅ Enable STUN Discovery

2. **Check Status**: After connecting, view your connection status in the connection panel

3. **Connection Info**: Click "Connection Info" to see:
   - Connection quality (Excellent/Good/Limited)
   - Router configuration status
   - Your public IP address
   - Any connection issues or recommendations

### Troubleshooting

**If UPnP fails:**
- Some routers have UPnP disabled - check router settings
- Corporate/school networks may block UPnP
- Fallback: Manual port forwarding may still be required

**NAT Types:**
- **Open NAT**: Best - direct connection possible
- **Moderate NAT**: Good - UPnP should work
- **Strict NAT**: Limited - may need manual port forwarding
- **Symmetric NAT**: Difficult - TURN relay may be needed (future feature)

## Protocol

Connects to Hytale voice server using shared packet format:
- Authentication handshake with username mapping
- Opus-encoded audio packet streaming
- Server acknowledgment
- Proximity-based audio routing (30 block range)

## TODO

- [x] Voice Activity Detection (VAD)
- [x] Push-to-talk mode
- [x] NAT Traversal (UPnP & STUN)
- [ ] Echo cancellation
- [ ] 3D positional audio (partial - spatialization implemented)
- [ ] TURN relay support for symmetric NAT
- [ ] Packet loss recovery
