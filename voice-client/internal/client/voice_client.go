package client

import (
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"net"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

const (
	PacketTypeAuthentication = 0x01
	PacketTypeAudio          = 0x02
	PacketTypeAuthAck        = 0x03
	PacketTypeDisconnect     = 0x04
	PacketTypeTestAudio      = 0x05
	PacketTypePlayerName     = 0x0B
	PacketTypeServerShutdown = 0x09
	AuthTimeoutSeconds       = 5
	audioHeaderLegacy        = 25
	audioHeaderWithCodec     = 26
	audioHeaderHashBased     = 14 // type(1) + codec(1) + hashId(4) + seqNum(4) + audioLen(4)
	vadThresholdDefault      = 1200
	vadHangoverFramesDefault = 30 // default hangover frames (~1.5 seconds at 20ms per frame)
	positionalMaxDistance    = 30.0
	DefaultVoicePort         = 24454
)

type VoiceClient struct {
	clientID            uuid.UUID
	username            string
	serverAddr          string
	serverPort          int
	serverUDPAddr       *net.UDPAddr
	socket              *net.UDPConn
	audioManager        *SimpleAudioManager
	codec               byte
	requestedSampleRate int
	selectedSampleRate  int
	vadEnabled          atomic.Bool
	vadThreshold        atomic.Uint32
	vadHangoverFrames   atomic.Uint32
	vadActive           bool
	vadHangover         int
	vadStateCB          atomic.Value // func(enabled bool, active bool)
	disconnectCB        atomic.Value // func(reason string) - called when disconnected
	pttEnabled          atomic.Bool
	pttActive           atomic.Bool
	pttKey              string
	masterVolume        float64
	micGain             float64
	// Per-player volume control
	hashToUsername      map[uint32]string    // hash ID -> username mapping
	playerVolumes       map[string]float64   // username -> volume multiplier (0.0-2.0)
	lastHeard           map[uint32]time.Time // hash ID -> last audio packet time
	defaultPlayerVolume float64              // default volume for new players (0.75 = 75%)
	volumeMu            sync.RWMutex         // protects volume-related maps
	connected           atomic.Bool
	sequenceNumber      atomic.Uint32
	rxDone              chan struct{}
	txDone              chan struct{}
	mu                  sync.Mutex
}

func NewVoiceClient() *VoiceClient {
	vc := &VoiceClient{
		clientID:            uuid.New(),
		rxDone:              make(chan struct{}, 1),
		txDone:              make(chan struct{}, 1),
		codec:               AudioCodecOpus,
		pttKey:              "Space",
		masterVolume:        1.0,
		micGain:             1.0,
		requestedSampleRate: defaultSampleRate,
		selectedSampleRate:  defaultSampleRate,
		hashToUsername:      make(map[uint32]string),
		playerVolumes:       make(map[string]float64),
		lastHeard:           make(map[uint32]time.Time),
		defaultPlayerVolume: 0.75, // Default 75% volume for new players
	}
	vc.vadEnabled.Store(true)
	vc.vadThreshold.Store(vadThresholdDefault)
	vc.vadHangoverFrames.Store(vadHangoverFramesDefault)
	vc.pttEnabled.Store(false)
	return vc
}

func (vc *VoiceClient) GetClientID() uuid.UUID {
	return vc.clientID
}

func (vc *VoiceClient) SetVAD(enabled bool, threshold int) {
	vc.vadEnabled.Store(enabled)
	if threshold <= 0 {
		threshold = vadThresholdDefault
	}
	vc.vadThreshold.Store(uint32(threshold))
	vc.notifyVADState()
}

func (vc *VoiceClient) SetVADHangover(frames int) {
	if frames < 0 {
		frames = 0
	}
	if frames > 200 {
		frames = 200
	}
	vc.vadHangoverFrames.Store(uint32(frames))
}

func (vc *VoiceClient) SetPushToTalk(enabled bool, key string) {
	vc.pttEnabled.Store(enabled)
	if key != "" {
		vc.pttKey = key
	}
	if enabled {
		vc.vadEnabled.Store(false)
		vc.notifyVADState()
	}
}

func (vc *VoiceClient) SetPTTActive(active bool) {
	vc.pttActive.Store(active)
}

func (vc *VoiceClient) SetMasterVolume(vol float64) {
	if vol < 0 {
		vol = 0
	}
	if vol > 4.0 {
		vol = 4.0
	}
	vc.mu.Lock()
	vc.masterVolume = vol
	if vc.audioManager != nil {
		vc.audioManager.SetOutputGain(vol)
	}
	vc.mu.Unlock()
}

func (vc *VoiceClient) SetMicGain(gain float64) {
	if gain < 0 {
		gain = 0
	}
	if gain > 4.0 {
		gain = 4.0
	}
	vc.mu.Lock()
	vc.micGain = gain
	if vc.audioManager != nil {
		vc.audioManager.SetMicGain(gain)
	}
	vc.mu.Unlock()
}

// SetPlayerVolume sets the volume for a specific player (0.0 to 2.0)
func (vc *VoiceClient) SetPlayerVolume(username string, volume float64) {
	if volume < 0 {
		volume = 0
	}
	if volume > 2.0 {
		volume = 2.0
	}
	vc.volumeMu.Lock()
	vc.playerVolumes[username] = volume
	vc.volumeMu.Unlock()
	log.Printf("[VOLUME] Set volume for '%s' to %.2f", username, volume)
}

// GetPlayerVolume gets the volume for a specific player
func (vc *VoiceClient) GetPlayerVolume(username string) float64 {
	vc.volumeMu.RLock()
	defer vc.volumeMu.RUnlock()

	volume, exists := vc.playerVolumes[username]
	if !exists {
		return vc.defaultPlayerVolume
	}
	return volume
}

// SetDefaultPlayerVolume sets the default volume for new players (0.0 to 2.0)
func (vc *VoiceClient) SetDefaultPlayerVolume(volume float64) {
	if volume < 0 {
		volume = 0
	}
	if volume > 2.0 {
		volume = 2.0
	}
	vc.volumeMu.Lock()
	vc.defaultPlayerVolume = volume
	vc.volumeMu.Unlock()
	log.Printf("[VOLUME] Set default player volume to %.2f", volume)
}

// GetDefaultPlayerVolume gets the default volume for new players
func (vc *VoiceClient) GetDefaultPlayerVolume() float64 {
	vc.volumeMu.RLock()
	defer vc.volumeMu.RUnlock()
	return vc.defaultPlayerVolume
}

// GetPlayerVolumes returns a copy of all player volumes
func (vc *VoiceClient) GetPlayerVolumes() map[string]float64 {
	vc.volumeMu.RLock()
	defer vc.volumeMu.RUnlock()

	// Return a copy to prevent external modification
	volumes := make(map[string]float64, len(vc.playerVolumes))
	for k, v := range vc.playerVolumes {
		volumes[k] = v
	}
	return volumes
}

// SetPlayerVolumes sets multiple player volumes at once
func (vc *VoiceClient) SetPlayerVolumes(volumes map[string]float64) {
	vc.volumeMu.Lock()
	defer vc.volumeMu.Unlock()

	for username, volume := range volumes {
		// Clamp volume to valid range
		if volume < 0 {
			volume = 0
		}
		if volume > 2.0 {
			volume = 2.0
		}
		vc.playerVolumes[username] = volume
	}
}

// GetActivePlayers returns a list of players who have sent audio recently
func (vc *VoiceClient) GetActivePlayers(inactiveDuration time.Duration) []string {
	vc.volumeMu.RLock()
	defer vc.volumeMu.RUnlock()

	now := time.Now()
	var active []string

	for hashID, lastTime := range vc.lastHeard {
		if now.Sub(lastTime) <= inactiveDuration {
			if username, exists := vc.hashToUsername[hashID]; exists {
				active = append(active, username)
			}
		}
	}

	return active
}

// GetAllKnownPlayers returns all players we've seen (active or inactive)
func (vc *VoiceClient) GetAllKnownPlayers() []string {
	vc.volumeMu.RLock()
	defer vc.volumeMu.RUnlock()

	// Use a map to track unique usernames and exclude self
	uniqueUsers := make(map[string]bool)
	for _, username := range vc.hashToUsername {
		if username != vc.username {
			uniqueUsers[username] = true
		}
	}

	players := make([]string, 0, len(uniqueUsers))
	for username := range uniqueUsers {
		players = append(players, username)
	}

	return players
}

func (vc *VoiceClient) SetRequestedSampleRate(sampleRate int) {
	vc.mu.Lock()
	vc.requestedSampleRate = sanitizeSampleRate(sampleRate)
	vc.mu.Unlock()
}

func (vc *VoiceClient) SwitchAudioDevices(inputDeviceLabel string, outputDeviceLabel string) error {
	vc.mu.Lock()
	if !vc.connected.Load() {
		vc.mu.Unlock()
		return fmt.Errorf("not connected")
	}
	current := vc.audioManager
	selectedSampleRate := vc.selectedSampleRate
	vc.mu.Unlock()

	newManager, err := vc.newAudioManager(inputDeviceLabel, outputDeviceLabel, selectedSampleRate)
	if err != nil {
		return err
	}

	if current != nil {
		_ = current.Stop()
	}

	if err := newManager.Start(); err != nil {
		return fmt.Errorf("failed to start new audio: %w", err)
	}
	newManager.SetOutputGain(vc.masterVolume)
	newManager.SetMicGain(vc.micGain)

	vc.mu.Lock()
	vc.audioManager = newManager
	if newManager.useOpus && newManager.encoder != nil && newManager.decoder != nil {
		vc.codec = AudioCodecOpus
	} else {
		vc.codec = AudioCodecPCM
	}
	vc.mu.Unlock()

	return nil
}

func (vc *VoiceClient) newAudioManager(inputDeviceLabel string, outputDeviceLabel string, sampleRate int) (*SimpleAudioManager, error) {
	am, err := NewSimpleAudioManager(sampleRate)
	if err != nil {
		return nil, err
	}
	am.SetInputDeviceLabel(inputDeviceLabel)
	am.SetOutputDeviceLabel(outputDeviceLabel)
	return am, nil
}

// SetVADStateListener registers a callback invoked when VAD enabled/active state changes.
func (vc *VoiceClient) SetVADStateListener(fn func(enabled bool, active bool)) {
	vc.vadStateCB.Store(fn)
}

// SetDisconnectListener registers a callback invoked when the client disconnects.
func (vc *VoiceClient) SetDisconnectListener(fn func(reason string)) {
	vc.disconnectCB.Store(fn)
}

// parseServerAddress parses a server address string that may contain a port.
// Supports formats: "host:port", "host" (uses defaultPort)
// Returns host and port, or error if invalid.
func parseServerAddress(serverAddr string, defaultPort int) (string, int, error) {
	if serverAddr == "" {
		return "", 0, fmt.Errorf("server address cannot be empty")
	}

	// Check if the address contains a port
	if strings.Contains(serverAddr, ":") {
		host, portStr, err := net.SplitHostPort(serverAddr)
		if err != nil {
			return "", 0, fmt.Errorf("invalid server address format: %w", err)
		}

		port, err := strconv.Atoi(portStr)
		if err != nil {
			return "", 0, fmt.Errorf("invalid port number: %w", err)
		}

		if port < 1 || port > 65535 {
			return "", 0, fmt.Errorf("port must be between 1 and 65535, got %d", port)
		}

		return host, port, nil
	}

	// No port specified, use default
	return serverAddr, defaultPort, nil
}

func (vc *VoiceClient) Connect(serverAddr string, serverPort int, username string, inputDeviceLabel string, outputDeviceLabel string) error {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	if vc.connected.Load() {
		return fmt.Errorf("already connected")
	}

	// Parse server address to extract host and port
	host, port, err := parseServerAddress(serverAddr, serverPort)
	if err != nil {
		return fmt.Errorf("invalid server address: %w", err)
	}

	vc.username = username
	vc.serverAddr = host
	vc.serverPort = port

	log.Printf("Connecting to voice server at %s:%d as user '%s'", host, port, username)

	// Create UDP socket
	socket, err := net.ListenUDP("udp", nil)
	if err != nil {
		return fmt.Errorf("failed to create UDP socket: %w", err)
	}
	vc.socket = socket

	// Resolve server address
	serverUDPAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", serverAddr, serverPort))
	if err != nil {
		vc.socket.Close()
		vc.audioManager.Stop()
		return fmt.Errorf("failed to resolve server address: %w", err)
	}
	vc.serverUDPAddr = serverUDPAddr

	vc.requestedSampleRate = sanitizeSampleRate(vc.requestedSampleRate)
	// Initialize selectedSampleRate to default in case authentication fails
	vc.selectedSampleRate = defaultSampleRate

	// Retry logic for authentication with exponential backoff
	const maxRetries = 3
	var lastErr error
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			log.Printf("Authentication attempt %d/%d", attempt, maxRetries)
			time.Sleep(time.Duration(math.Pow(2, float64(attempt-2))) * time.Second)
		}

		// Send authentication packet
		if err := vc.sendAuthentication(); err != nil {
			lastErr = err
			continue
		}

		// Wait for server acknowledgment
		socket.SetReadDeadline(time.Now().Add(time.Duration(AuthTimeoutSeconds) * time.Second))
		selectedSampleRate, err := vc.waitForAcknowledgment()
		if err != nil {
			lastErr = err
			if attempt < maxRetries {
				continue
			}
			vc.socket.Close()
			return fmt.Errorf("server did not acknowledge authentication after %d attempts: %w", maxRetries, err)
		}

		// Sanitize the sample rate received from server for defensive programming.
		// Note: parseAuthAck() already sanitizes, but we do it again here to ensure
		// consistency and protect against any future changes to parseAuthAck.
		vc.selectedSampleRate = sanitizeSampleRate(selectedSampleRate)

		// Initialize audio manager after auth so we can use the negotiated sample rate
		audioManager, err := vc.newAudioManager(inputDeviceLabel, outputDeviceLabel, vc.selectedSampleRate)
		if err != nil {
			vc.socket.Close()
			return fmt.Errorf("failed to initialize audio: %w", err)
		}
		if audioManager == nil {
			vc.socket.Close()
			return fmt.Errorf("audio manager unavailable")
		}
		if err := audioManager.Start(); err != nil {
			vc.socket.Close()
			return fmt.Errorf("failed to start audio: %w", err)
		}
		vc.audioManager = audioManager
		vc.audioManager.SetOutputGain(vc.masterVolume)
		vc.audioManager.SetMicGain(vc.micGain)

		vc.codec = AudioCodecPCM
		if audioManager.useOpus && audioManager.encoder != nil && audioManager.decoder != nil {
			vc.codec = AudioCodecOpus
		}

		// Success
		log.Println("Server acknowledged connection")
		vc.connected.Store(true)
		socket.SetReadDeadline(time.Time{})

		// Start goroutines
		go vc.transmitLoop()
		go vc.receiveLoop()

		return nil
	}

	vc.socket.Close()
	return fmt.Errorf("failed to connect after %d attempts: %w", maxRetries, lastErr)
}

func (vc *VoiceClient) SendTestTone(duration time.Duration) error {
	if !vc.connected.Load() {
		return fmt.Errorf("not connected")
	}
	if vc.audioManager == nil {
		return fmt.Errorf("audio not initialized")
	}
	return vc.audioManager.SendTestTone(duration, 1000)
}

// SendBroadcastTestTone sends a test tone as a broadcast (non-positional) packet to all clients.
func (vc *VoiceClient) SendBroadcastTestTone(duration time.Duration) error {
	if !vc.connected.Load() {
		return fmt.Errorf("not connected")
	}
	if vc.audioManager == nil {
		return fmt.Errorf("audio not initialized")
	}

	// Generate and send tone frames directly so they bypass VAD and are marked as broadcast/test.
	frameSize := vc.audioManager.frameSize
	sampleRate := vc.audioManager.sampleRate
	frameDuration := time.Duration(float64(time.Second) * float64(frameSize) / float64(sampleRate))
	totalFrames := int(duration / frameDuration)
	if totalFrames < 1 {
		totalFrames = 1
	}

	phase := 0.0
	phaseInc := 2 * math.Pi * 1000 / float64(sampleRate)
	amplitude := 0.2 * float64(math.MaxInt16)

	for i := 0; i < totalFrames; i++ {
		samples := make([]int16, frameSize)
		for j := 0; j < frameSize; j++ {
			samples[j] = int16(math.Sin(phase) * amplitude)
			phase += phaseInc
			if phase >= 2*math.Pi {
				phase -= 2 * math.Pi
			}
		}

		audioData, err := vc.audioManager.EncodeAudio(vc.codec, samples)
		if err != nil {
			return fmt.Errorf("encode test tone: %w", err)
		}

		if err := vc.sendAudioPacketWithType(audioData, PacketTypeTestAudio); err != nil {
			return fmt.Errorf("send test tone: %w", err)
		}

		time.Sleep(frameDuration)
	}

	return nil
}

func (vc *VoiceClient) Disconnect() error {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	if !vc.connected.Load() {
		return nil
	}

	// Send disconnect packet to server
	if vc.socket != nil && vc.serverUDPAddr != nil {
		vc.sendDisconnect()
	}

	vc.connected.Store(false)

	if vc.audioManager != nil {
		vc.audioManager.Stop()
	}

	if vc.socket != nil {
		vc.socket.Close()
	}

	select {
	case <-vc.rxDone:
	case <-time.After(1 * time.Second):
	}

	select {
	case <-vc.txDone:
	case <-time.After(1 * time.Second):
	}

	// Clean up volume-related maps to prevent memory leaks
	vc.volumeMu.Lock()
	vc.hashToUsername = make(map[uint32]string)
	vc.lastHeard = make(map[uint32]time.Time)
	// Keep playerVolumes as they represent user preferences
	vc.volumeMu.Unlock()

	log.Println("Disconnected from voice server")
	return nil
}

func (vc *VoiceClient) sendDisconnect() {
	packet := make([]byte, 17)
	packet[0] = PacketTypeDisconnect
	copy(packet[1:17], vc.clientID[:])
	vc.socket.WriteToUDP(packet, vc.serverUDPAddr)
	log.Println("Sent disconnect packet to server")
}

func (vc *VoiceClient) sendAuthentication() error {
	usernameBytes := []byte(vc.username)
	requestedSampleRate := sanitizeSampleRate(vc.requestedSampleRate)
	packet := make([]byte, 1+16+4+len(usernameBytes)+4)
	packet[0] = PacketTypeAuthentication
	copy(packet[1:17], vc.clientID[:])
	binary.BigEndian.PutUint32(packet[17:21], uint32(len(usernameBytes)))
	copy(packet[21:], usernameBytes)
	binary.BigEndian.PutUint32(packet[21+len(usernameBytes):], uint32(requestedSampleRate))

	_, err := vc.socket.WriteToUDP(packet, vc.serverUDPAddr)
	return err
}

type authRejectReason byte

const (
	authAccepted       authRejectReason = 0
	authPlayerNotFound authRejectReason = 1
	authServerNotReady authRejectReason = 2
	authInvalidCreds   authRejectReason = 3
)

var errPlayerNotInGame = fmt.Errorf("player not in game")

func (vc *VoiceClient) waitForAcknowledgment() (int, error) {
	buffer := make([]byte, 256)

	for {
		n, _, err := vc.socket.ReadFromUDP(buffer)
		if err != nil {
			return defaultSampleRate, err
		}

		if n < 20 {
			continue
		}

		if buffer[0] != PacketTypeAuthAck {
			continue
		}

		ackClientID, reason, message, selectedSampleRate, ok := parseAuthAck(buffer[:n])
		if !ok {
			continue
		}
		if ackClientID != vc.clientID {
			continue
		}
		if reason != authAccepted {
			if reason == authPlayerNotFound {
				return defaultSampleRate, errPlayerNotInGame
			}
			return defaultSampleRate, fmt.Errorf("authentication rejected (reason=%d): %s", reason, message)
		}
		log.Printf("Received authentication acknowledgment: %s", message)
		return selectedSampleRate, nil
	}
}

func (vc *VoiceClient) receiveLoop() {
	defer func() { vc.rxDone <- struct{}{} }()

	buffer := make([]byte, 4096)
	packetCount := 0

	for vc.connected.Load() {
		n, _, err := vc.socket.ReadFromUDP(buffer)
		if err != nil {
			if vc.connected.Load() {
				log.Printf("Socket closed or receive error: %v", err)
				// Server shutdown or socket closed - disconnect
				vc.connected.Store(false)
				vc.notifyDisconnect("Server connection lost")
				_ = vc.Disconnect()
			}
			return
		}

		if n < 1 {
			continue
		}

		packetType := buffer[0]

		// Handle PlayerNamePacket (0x0B) - hash ID to username mapping
		if packetType == PacketTypePlayerName {
			vc.handlePlayerNamePacket(buffer[:n])
			continue
		}

		// Handle server shutdown packet
		if packetType == PacketTypeServerShutdown {
			reason := "Server shutdown"
			if n >= 3 {
				msgLen := binary.BigEndian.Uint16(buffer[1:3])
				reasonLen := int(msgLen)
				end := 3 + reasonLen
				if reasonLen >= 0 && end <= n && end <= len(buffer) {
					reason = string(buffer[3:end])
					log.Printf("Server shutdown: %s", reason)
				} else {
					log.Printf("Server shutdown (malformed packet)")
				}
			}
			vc.connected.Store(false)
			vc.notifyDisconnect(reason)
			_ = vc.Disconnect()
			return
		}

		if n < audioHeaderHashBased {
			continue
		}

		if packetType != PacketTypeAudio && packetType != PacketTypeTestAudio {
			continue
		}

		codec, audioData, pos, hashID, ok := parseAudioPayload(buffer[:n])
		if !ok {
			continue
		}

		packetCount++
		if packetCount%100 == 1 {
			log.Printf("Received audio packet #%d, size=%d bytes, hashID=%d", packetCount, len(audioData), hashID)
		}

		if vc.audioManager != nil {
			samples, err := vc.audioManager.DecodeAudio(codec, audioData)
			if err != nil {
				log.Printf("Error decoding audio: %v", err)
				continue
			}

			// Apply per-player volume before spatialization
			samples = vc.applyPlayerVolume(samples, hashID)

			stereo := spatialize(samples, pos, positionalMaxDistance)
			if stereo == nil {
				continue
			}

			vc.audioManager.enqueueOutput(stereo)
		}

	}
}

func (vc *VoiceClient) transmitLoop() {
	defer func() { vc.txDone <- struct{}{} }()

	for vc.connected.Load() {
		inputChan := vc.getInputChannel()
		if inputChan == nil {
			time.Sleep(50 * time.Millisecond)
			continue
		}

		select {
		case samples := <-inputChan:
			if len(samples) == 0 {
				continue
			}

			if vc.pttEnabled.Load() {
				if !vc.pttActive.Load() {
					continue
				}
			} else {
				if !vc.shouldTransmit(samples) {
					continue
				}
			}

			audioData, err := vc.audioManager.EncodeAudio(vc.codec, samples)
			if err != nil {
				log.Printf("Error encoding audio: %v", err)
				continue
			}

			if err := vc.sendAudioPacket(audioData); err != nil {
				if vc.connected.Load() {
					log.Printf("Error sending audio: %v", err)
				}
				continue
			}

		case <-time.After(100 * time.Millisecond):
		}
	}
}

func (vc *VoiceClient) getInputChannel() <-chan []int16 {
	vc.mu.Lock()
	defer vc.mu.Unlock()
	if vc.audioManager == nil {
		return nil
	}
	return vc.audioManager.GetInputChannel()
}

func (vc *VoiceClient) sendAudioPacket(audioData []byte) error {
	return vc.sendAudioPacketWithType(audioData, PacketTypeAudio)
}

func (vc *VoiceClient) sendAudioPacketWithType(audioData []byte, packetType byte) error {
	seqNum := vc.sequenceNumber.Add(1) - 1

	packet := make([]byte, audioHeaderWithCodec+len(audioData))
	packet[0] = packetType
	packet[1] = vc.codec
	copy(packet[2:18], vc.clientID[:])
	binary.BigEndian.PutUint32(packet[18:22], seqNum)
	binary.BigEndian.PutUint32(packet[22:26], uint32(len(audioData)))
	copy(packet[26:], audioData)

	_, err := vc.socket.WriteToUDP(packet, vc.serverUDPAddr)
	return err
}

func (vc *VoiceClient) shouldTransmit(samples []int16) bool {
	if !vc.vadEnabled.Load() {
		return true
	}

	prevActive := vc.vadActive
	threshold := float64(vc.vadThreshold.Load())
	rms := calculateRMS(samples)
	if rms >= threshold {
		vc.vadActive = true
		vc.vadHangover = int(vc.vadHangoverFrames.Load())
		if prevActive != vc.vadActive {
			vc.notifyVADState()
		}
		return true
	}

	if vc.vadActive {
		if vc.vadHangover > 0 {
			vc.vadHangover--
			if prevActive != vc.vadActive {
				vc.notifyVADState()
			}
			return true
		}
		vc.vadActive = false
		if prevActive != vc.vadActive {
			vc.notifyVADState()
		}
	}

	return false
}

func (vc *VoiceClient) notifyVADState() {
	cb, ok := vc.vadStateCB.Load().(func(bool, bool))
	if !ok || cb == nil {
		return
	}
	cb(vc.vadEnabled.Load(), vc.vadActive)
}

func (vc *VoiceClient) notifyDisconnect(reason string) {
	cb, ok := vc.disconnectCB.Load().(func(string))
	if !ok || cb == nil {
		return
	}
	cb(reason)
}

func calculateRMS(samples []int16) float64 {
	if len(samples) == 0 {
		return 0
	}
	var sum float64
	for _, s := range samples {
		v := float64(s)
		sum += v * v
	}
	return math.Sqrt(sum / float64(len(samples)))
}

func attenuationForDistance(maxDistance float64, x, y, z float32) float64 {
	d := math.Sqrt(float64(x*x + y*y + z*z))
	if d <= 0 {
		return 1.0
	}
	if d >= maxDistance {
		return 0.0
	}
	f := 1.0 - (d / maxDistance)
	return f * f // gentle rolloff
}

func applyAttenuation(samples []int16, factor float64) []int16 {
	if factor >= 0.9999 {
		return samples
	}
	if factor <= 0 {
		return nil
	}
	out := make([]int16, len(samples))
	maxVal := float64(math.MaxInt16)
	minVal := float64(math.MinInt16)
	for i, s := range samples {
		scaled := float64(s) * factor
		if scaled > maxVal {
			scaled = maxVal
		} else if scaled < minVal {
			scaled = minVal
		}
		out[i] = int16(scaled)
	}
	return out
}

func spatialize(samples []int16, pos *[3]float32, maxDistance float64) []int16 {
	if len(samples) == 0 {
		return nil
	}

	att := 1.0
	pan := 0.0
	elev := 0.0

	if pos != nil {
		d := math.Sqrt(float64(pos[0]*pos[0] + pos[1]*pos[1] + pos[2]*pos[2]))
		if d >= maxDistance {
			return nil
		}
		if d > 0 {
			att = 1.0 - (d / maxDistance)
			att *= att

			lr := math.Hypot(float64(pos[0]), float64(pos[2]))
			if lr > 0 {
				// Left/right comes from X in listener frame (+X = right).
				pan = float64(pos[0]) / lr
			}

			elevAngle := math.Atan2(float64(pos[1]), lr) // radians, -pi/2..pi/2
			elev = elevAngle / (math.Pi / 2)             // normalize to -1..1
			if elev < -1 {
				elev = -1
			} else if elev > 1 {
				elev = 1
			}
		}
		panPreview := 1.0 + 1.2*elev
		log.Printf("[SPATIALIZE] pos=(%.2f,%.2f,%.2f) dist=%.2f att=%.3f pan=%.3f elevNorm=%.3f panScale=%.3f", pos[0], pos[1], pos[2], d, att, pan, elev, panPreview)
	}

	// Equal-power panning without elevation widening to keep front/side accuracy
	if pan < -1 {
		pan = -1
	}
	if pan > 1 {
		pan = 1
	}
	leftGain := att * math.Sqrt((1.0-pan)*0.5)
	rightGain := att * math.Sqrt((1.0+pan)*0.5)

	out := make([]int16, len(samples)*2)
	for i, s := range samples {
		v := float64(s)
		l := v * leftGain
		r := v * rightGain
		if l > math.MaxInt16 {
			l = math.MaxInt16
		} else if l < math.MinInt16 {
			l = math.MinInt16
		}
		if r > math.MaxInt16 {
			r = math.MaxInt16
		} else if r < math.MinInt16 {
			r = math.MinInt16
		}
		out[2*i] = int16(l)
		out[2*i+1] = int16(r)
	}

	return out
}

// handlePlayerNamePacket processes PlayerNamePacket (0x0B) to map hash IDs to usernames
func (vc *VoiceClient) handlePlayerNamePacket(data []byte) {
	// Packet format: type(1) + serverId(16) + hashId(4) + usernameLen(4) + username
	if len(data) < 25 {
		log.Printf("Invalid PlayerNamePacket: too short (%d bytes)", len(data))
		return
	}

	hashID := binary.BigEndian.Uint32(data[17:21])
	usernameLen := binary.BigEndian.Uint32(data[21:25])

	if len(data) < 25+int(usernameLen) {
		log.Printf("Invalid PlayerNamePacket: username truncated")
		return
	}

	username := string(data[25 : 25+usernameLen])

	vc.volumeMu.Lock()
	vc.hashToUsername[hashID] = username
	vc.volumeMu.Unlock()

	log.Printf("[PLAYER_NAME] Mapped hashID %d to username '%s'", hashID, username)
}

// applyPlayerVolume applies per-player volume to audio samples
func (vc *VoiceClient) applyPlayerVolume(samples []int16, hashID uint32) []int16 {
	if hashID == 0 {
		// Legacy packet without hash ID - skip per-player volume
		return samples
	}

	vc.volumeMu.Lock()

	// Update last heard timestamp
	vc.lastHeard[hashID] = time.Now()

	// Determine username for this hash ID
	username, exists := vc.hashToUsername[hashID]

	var volumeToUse float64
	unknownPlayer := false
	newPlayer := false

	if !exists {
		// Username not yet mapped - use default volume
		unknownPlayer = true
		volumeToUse = vc.defaultPlayerVolume
	} else {
		// Get player-specific volume
		volume, ok := vc.playerVolumes[username]
		if !ok {
			// Player has no custom volume set - use default
			volume = vc.defaultPlayerVolume
			vc.playerVolumes[username] = volume
			newPlayer = true
		}
		volumeToUse = volume
	}

	vc.volumeMu.Unlock()

	if unknownPlayer {
		log.Printf("[VOLUME] Unknown player (hashID=%d), using default volume %.2f", hashID, volumeToUse)
	} else if newPlayer {
		log.Printf("[VOLUME] New player '%s' (hashID=%d), using default volume %.2f", username, hashID, volumeToUse)
	}

	return scaleAudioSamples(samples, volumeToUse)
}

// scaleAudioSamples applies volume scaling to audio samples
func scaleAudioSamples(samples []int16, gain float64) []int16 {
	if gain == 1.0 {
		return samples
	}

	scaled := make([]int16, len(samples))
	for i, sample := range samples {
		v := float64(sample) * gain
		if v > math.MaxInt16 {
			v = math.MaxInt16
		} else if v < math.MinInt16 {
			v = math.MinInt16
		}
		scaled[i] = int16(v)
	}
	return scaled
}

func parseAuthAck(data []byte) (uuid.UUID, authRejectReason, string, int, bool) {
	if len(data) < 20 {
		return uuid.UUID{}, 0, "", defaultSampleRate, false
	}
	if data[0] != PacketTypeAuthAck {
		return uuid.UUID{}, 0, "", defaultSampleRate, false
	}

	var idBytes [16]byte
	copy(idBytes[:], data[1:17])
	ackClientID, err := uuid.FromBytes(idBytes[:])
	if err != nil {
		return uuid.UUID{}, 0, "", defaultSampleRate, false
	}

	// rejection reason (0=accepted)
	reason := authRejectReason(data[17])
	messageLen := binary.BigEndian.Uint16(data[18:20])
	if 20+int(messageLen) > len(data) {
		return uuid.UUID{}, 0, "", defaultSampleRate, false
	}
	message := string(data[20 : 20+int(messageLen)])
	readIndex := 20 + int(messageLen)
	sampleRate := defaultSampleRate
	if readIndex+4 <= len(data) {
		sampleRate = int(binary.BigEndian.Uint32(data[readIndex : readIndex+4]))
	}
	return ackClientID, reason, message, sanitizeSampleRate(sampleRate), true
}

func parseAudioPayload(data []byte) (byte, []byte, *[3]float32, uint32, bool) {
	if len(data) < audioHeaderHashBased {
		return AudioCodecPCM, nil, nil, 0, false
	}

	packetType := data[0]
	if packetType != PacketTypeAudio && packetType != PacketTypeTestAudio {
		return AudioCodecPCM, nil, nil, 0, false
	}

	codecByte := data[1]
	baseCodec := codecByte & 0x7F
	hasPos := (codecByte & 0x80) != 0

	// Check if this is a hash-based packet (14 bytes header) or UUID-based packet (26 bytes header)
	// Hash-based: type(1) + codec(1) + hashId(4) + seqNum(4) + audioLen(4) = 14 bytes
	// UUID-based: type(1) + codec(1) + uuid(16) + seqNum(4) + audioLen(4) = 26 bytes

	// Try hash-based format first (newer, smaller header)
	if baseCodec == AudioCodecOpus || baseCodec == AudioCodecPCM {
		// Check if packet is long enough for hash-based header
		if len(data) >= audioHeaderHashBased {
			hashID := binary.BigEndian.Uint32(data[2:6])
			audioLen := binary.BigEndian.Uint32(data[10:14])
			totalLen := audioHeaderHashBased + int(audioLen)

			// Only treat as hash-based if the length matches exactly either:
			// - header + audio data, or
			// - header + audio data + 12 bytes of positional data (when hasPos is true).
			if audioLen > 0 && (totalLen == len(data) || (hasPos && totalLen+12 == len(data))) {
				// Valid hash-based packet
				var pos *[3]float32
				if hasPos && len(data) == totalLen+12 {
					pos = &[3]float32{
						math.Float32frombits(binary.BigEndian.Uint32(data[totalLen : totalLen+4])),
						math.Float32frombits(binary.BigEndian.Uint32(data[totalLen+4 : totalLen+8])),
						math.Float32frombits(binary.BigEndian.Uint32(data[totalLen+8 : totalLen+12])),
					}
					log.Printf("[AUDIO_RX] hashID=%d hasPos=true position=(%.2f,%.2f,%.2f)", hashID, pos[0], pos[1], pos[2])
				} else if !hasPos && totalLen == len(data) {
					log.Printf("[AUDIO_RX] hashID=%d hasPos=false (broadcast/non-positional)", hashID)
				}
				return baseCodec, data[14:totalLen], pos, hashID, true
			}
		}

		// Fall back to UUID-based format (legacy)
		if len(data) < audioHeaderWithCodec {
			return AudioCodecPCM, nil, nil, 0, false
		}
		audioLen := binary.BigEndian.Uint32(data[22:26])
		totalLen := audioHeaderWithCodec + int(audioLen)
		if totalLen > len(data) || audioLen == 0 {
			return AudioCodecPCM, nil, nil, 0, false
		}
		var pos *[3]float32
		if hasPos && len(data) >= totalLen+12 {
			pos = &[3]float32{
				math.Float32frombits(binary.BigEndian.Uint32(data[totalLen : totalLen+4])),
				math.Float32frombits(binary.BigEndian.Uint32(data[totalLen+4 : totalLen+8])),
				math.Float32frombits(binary.BigEndian.Uint32(data[totalLen+8 : totalLen+12])),
			}
			log.Printf("[AUDIO_RX] UUID-based hasPos=true position=(%.2f,%.2f,%.2f)", pos[0], pos[1], pos[2])
		} else if !hasPos {
			log.Printf("[AUDIO_RX] UUID-based hasPos=false (broadcast/non-positional)")
		}
		return baseCodec, data[26:totalLen], pos, 0, true // Return 0 for hashID (legacy packet)
	}

	// Legacy PCM format without codec byte
	audioLen := binary.BigEndian.Uint32(data[21:25])
	totalLen := audioHeaderLegacy + int(audioLen)
	if totalLen > len(data) || audioLen == 0 {
		return AudioCodecPCM, nil, nil, 0, false
	}
	return AudioCodecPCM, data[25:totalLen], nil, 0, true
}
