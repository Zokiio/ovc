# Hytale Voice Chat - Go Client

A lightweight voice chat client for Hytale written in Go.

## Building

### Prerequisites
- Go 1.25+
- PortAudio and Opus development libraries
  - **macOS**: `brew install portaudio opus`
  - **Windows (MSYS2)**:
    - Install MSYS2 from https://www.msys2.org/
    - Open **MSYS2 MINGW64** terminal and run:
      ```bash
      pacman -Syu
      pacman -S --needed mingw-w64-x86_64-toolchain mingw-w64-x86_64-pkg-config mingw-w64-x86_64-portaudio mingw-w64-x86_64-opus mingw-w64-x86_64-opusfile
      ```
    - **Important**: Add MSYS2 MinGW to your PATH (should be first):
      - Add `C:\msys64\mingw64\bin` to your System PATH environment variable
      - Or set temporarily in PowerShell: `$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"`
  - **Linux**: `apt-get install portaudio19-dev libopus-dev libopusfile-dev`

### Build for current platform

**Windows (PowerShell) - Recommended:**
```powershell
# Use the build script (automatically copies DLLs):
.\build.ps1

# Or build with no console window:
.\build.ps1 -NoWindow

# Or use Make:
make build-gui
```

**Manual build (Windows):**
```powershell
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
$env:CGO_ENABLED = "1"
go build -o dist\HytaleVoiceChat.exe .\cmd\voice-client

# Then copy required DLLs from C:\msys64\mingw64\bin\ to dist\
```

**macOS/Linux:**
```bash
go build -o dist/HytaleVoiceChat ./cmd/voice-client
```

### Build for Windows (from macOS/Linux)
```bash
GOOS=windows GOARCH=amd64 go build -o HytaleVoiceChat.exe ./cmd/voice-client
```

### Build for Windows (GUI, no console window)
```powershell
$env:PATH = "C:\msys64\mingw64\bin;$env:PATH"
$env:CGO_ENABLED = "1"
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

The built application is in the `dist/` directory:

**Windows:**
```bash
.\dist\HytaleVoiceChat.exe
```

**macOS/Linux:**
```bash
./dist/HytaleVoiceChat
```

Launch the client and enter connection details:

### Connection Formats
The server field supports multiple formats:
- **Domain name**: `hytale.techynoodle.com` (uses default port 24454)
- **Domain with port**: `hytale.techynoodle.com:25000`
- **IP address**: `192.168.1.100` (uses default port 24454)
- **IP with port**: `192.168.1.100:24454`
- **Localhost**: `localhost` (uses default port 24454)

The port field will auto-populate if a port is included in the server address.

### Example Usage
```bash
./dist/HytaleVoiceChat
```

Or on Windows:
```bash
.\dist\HytaleVoiceChat.exe
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

## Protocol

Connects to Hytale voice server using shared packet format:
- Authentication handshake with username mapping
- Opus-encoded audio packet streaming
- Server acknowledgment
- Proximity-based audio routing (30 block range)

## TODO

- [ ] Voice Activity Detection (VAD)
- [ ] Echo cancellation
- [ ] 3D positional audio
- [ ] Push-to-talk mode
- [ ] Connection status UI improvements
- [ ] Packet loss recovery
