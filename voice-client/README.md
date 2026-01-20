# Hytale Voice Chat - Go Client

A lightweight voice chat client for Hytale written in Go.

## Building

### Prerequisites
- Go 1.23+
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

- Lightweight GUI built with Fyne
- UDP audio streaming
- Microphone and speaker selection
- Config persistence for server, username, and devices
- Opus codec support (planned)
- Cross-platform (Windows, macOS, Linux)
- Single executable (no Java required!)

## Protocol

Connects to Hytale voice server using the same packet format as Java client:
- Authentication handshake
- Audio packet streaming
- Server acknowledgment

## TODO

- [ ] Opus codec integration
- [ ] Audio transmit loop
- [ ] Audio receive loop
- [ ] Connection status UI improvements
- [ ] Error handling UI
