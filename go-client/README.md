# Hytale Voice Chat - Go Client

A lightweight voice chat client for Hytale written in Go.

## Building

### Prerequisites
- Go 1.23+
- PortAudio development libraries
  - **macOS**: `brew install portaudio`
  - **Windows**: Download from http://www.portaudio.com/
  - **Linux**: `apt-get install portaudio19-dev`

### Build for current platform
```bash
go build -o HytaleVoiceChat
```

### Build for Windows (from macOS/Linux)
```bash
GOOS=windows GOARCH=amd64 go build -o HytaleVoiceChat.exe
```

### Build for macOS
```bash
go build -o HytaleVoiceChat
```

### Build for Linux
```bash
go build -o HytaleVoiceChat
```

## Running

```bash
./HytaleVoiceChat
```

Or on Windows:
```bash
HytaleVoiceChat.exe
```

## Features

- Lightweight GUI built with Fyne
- UDP audio streaming
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
- [ ] Microphone input capture with PortAudio
- [ ] Speaker output with PortAudio
- [ ] Audio transmit loop
- [ ] Audio receive loop
- [ ] Connection status UI improvements
- [ ] Error handling UI
