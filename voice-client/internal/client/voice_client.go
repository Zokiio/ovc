package client

import (
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"net"
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
	AuthTimeoutSeconds       = 5
	audioHeaderLegacy        = 25
	audioHeaderWithCodec     = 26
	vadThresholdDefault      = 1200
	vadHangoverFramesDefault = 30 // default hangover frames (~1.5 seconds at 20ms per frame)
	positionalMaxDistance    = 30.0
)

type VoiceClient struct {
	clientID          uuid.UUID
	username          string
	serverAddr        string
	serverPort        int
	serverUDPAddr     *net.UDPAddr
	socket            *net.UDPConn
	audioManager      *SimpleAudioManager
	codec             byte
	vadEnabled        atomic.Bool
	vadThreshold      atomic.Uint32
	vadHangoverFrames atomic.Uint32
	vadActive         bool
	vadHangover       int
	vadStateCB        atomic.Value // func(enabled bool, active bool)
	pttEnabled        atomic.Bool
	pttActive         atomic.Bool
	pttKey            string
	masterVolume      float64
	micGain           float64
	connected         atomic.Bool
	sequenceNumber    atomic.Uint32
	rxDone            chan struct{}
	txDone            chan struct{}
	mu                sync.Mutex

	// NAT Traversal
	natTraversal *NATTraversal
	natInfo      *NATInfo
	enableUPnP   bool
	enableSTUN   bool
}

func NewVoiceClient() *VoiceClient {
	vc := &VoiceClient{
		clientID:     uuid.New(),
		rxDone:       make(chan struct{}, 1),
		txDone:       make(chan struct{}, 1),
		codec:        AudioCodecOpus,
		pttKey:       "Space",
		masterVolume: 1.0,
		micGain:      1.0,
		enableUPnP:   true, // Enable UPnP by default
		enableSTUN:   true, // Enable STUN by default
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

func (vc *VoiceClient) SwitchAudioDevices(inputDeviceLabel string, outputDeviceLabel string) error {
	vc.mu.Lock()
	if !vc.connected.Load() {
		vc.mu.Unlock()
		return fmt.Errorf("not connected")
	}
	current := vc.audioManager
	vc.mu.Unlock()

	newManager, err := vc.newAudioManager(inputDeviceLabel, outputDeviceLabel)
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

func (vc *VoiceClient) newAudioManager(inputDeviceLabel string, outputDeviceLabel string) (*SimpleAudioManager, error) {
	am, err := NewSimpleAudioManager()
	if err != nil {
		return nil, err
	}
	am.SetInputDeviceLabel(inputDeviceLabel)
	am.SetOutputDeviceLabel(outputDeviceLabel)
	return am, nil
}

// SetNATTraversal enables or disables NAT traversal features
func (vc *VoiceClient) SetNATTraversal(enableUPnP bool, enableSTUN bool) {
	vc.mu.Lock()
	defer vc.mu.Unlock()
	vc.enableUPnP = enableUPnP
	vc.enableSTUN = enableSTUN
	log.Printf("[NAT] NAT traversal settings: UPnP=%v, STUN=%v", enableUPnP, enableSTUN)
}

// GetNATInfo returns current NAT information
func (vc *VoiceClient) GetNATInfo() *NATInfo {
	vc.mu.Lock()
	defer vc.mu.Unlock()
	return vc.natInfo
}

// GetNATStatus returns a user-friendly connection status string
func (vc *VoiceClient) GetNATStatus() string {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	if vc.natInfo == nil {
		return "Connection: Checking..."
	}

	// Provide user-friendly status based on NAT type
	var status string
	switch vc.natInfo.Type {
	case NATTypeOpen:
		status = "Connection: Excellent"
	case NATTypeModerate:
		status = "Connection: Good"
	case NATTypeStrict:
		status = "Connection: Limited"
	case NATTypeSymmetric, NATTypeBlocked:
		status = "Connection: Poor"
	default:
		status = "Connection: Unknown"
	}

	// Add automatic setup indicator
	if vc.natInfo.UPnPMapped {
		status += " ✓"
	}

	return status
}

// SetVADStateListener registers a callback invoked when VAD enabled/active state changes.
func (vc *VoiceClient) SetVADStateListener(fn func(enabled bool, active bool)) {
	vc.vadStateCB.Store(fn)
}

func (vc *VoiceClient) Connect(serverAddr string, serverPort int, username string, inputDeviceLabel string, outputDeviceLabel string) error {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	if vc.connected.Load() {
		return fmt.Errorf("already connected")
	}

	vc.username = username
	vc.serverAddr = serverAddr
	vc.serverPort = serverPort

	log.Printf("Connecting to voice server at %s:%d as user '%s'", serverAddr, serverPort, username)

	// Initialize audio manager
	audioManager, err := vc.newAudioManager(inputDeviceLabel, outputDeviceLabel)
	if err != nil {
		return fmt.Errorf("failed to initialize audio: %w", err)
	}
	if audioManager == nil {
		return fmt.Errorf("audio manager unavailable")
	}
	if err := audioManager.Start(); err != nil {
		return fmt.Errorf("failed to start audio: %w", err)
	}
	vc.audioManager = audioManager
	vc.audioManager.SetOutputGain(vc.masterVolume)
	vc.audioManager.SetMicGain(vc.micGain)

	vc.codec = AudioCodecPCM
	if audioManager.useOpus && audioManager.encoder != nil && audioManager.decoder != nil {
		vc.codec = AudioCodecOpus
	}

	// Create UDP socket
	socket, err := net.ListenUDP("udp", nil)
	if err != nil {
		vc.audioManager.Stop()
		return fmt.Errorf("failed to create UDP socket: %w", err)
	}
	vc.socket = socket

	// Get the local port that was assigned
	localAddr := socket.LocalAddr().(*net.UDPAddr)
	localPort := localAddr.Port
	log.Printf("[NAT] Local UDP socket bound to port %d", localPort)

	// Setup NAT traversal if enabled
	if vc.enableUPnP || vc.enableSTUN {
		log.Printf("[NAT] Setting up NAT traversal (UPnP=%v, STUN=%v)...", vc.enableUPnP, vc.enableSTUN)

		// Use localPort for both internal and external mapping
		// This way the client receives on the same port it's already bound to
		natTraversal, natInfo, err := SetupNATWithRetry(localPort, localPort, "Hytale Voice Chat", vc.enableUPnP, vc.enableSTUN)
		if err != nil {
			log.Printf("[NAT] NAT traversal setup failed: %v", err)
			// Continue anyway - NAT traversal is optional
		} else {
			vc.natTraversal = natTraversal
			vc.natInfo = natInfo
			log.Printf("[NAT] NAT traversal setup complete: %s", vc.GetNATStatus())
		}
	} else {
		log.Printf("[NAT] NAT traversal disabled by configuration")
	}

	// Resolve server address
	serverUDPAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", serverAddr, serverPort))
	if err != nil {
		vc.socket.Close()
		vc.audioManager.Stop()
		return fmt.Errorf("failed to resolve server address: %w", err)
	}
	vc.serverUDPAddr = serverUDPAddr

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
		if err := vc.waitForAcknowledgment(); err != nil {
			lastErr = err
			if attempt < maxRetries {
				continue
			}
			vc.socket.Close()
			vc.audioManager.Stop()
			return fmt.Errorf("server did not acknowledge authentication after %d attempts: %w", maxRetries, err)
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
	vc.audioManager.Stop()
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

	// Generate and send tone frames directly so they bypass VAD and are marked as broadcast/test.
	frameSize := 960
	sampleRate := 48000
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

	// Clean up NAT traversal
	if vc.natTraversal != nil {
		if err := vc.natTraversal.RemovePortMapping(); err != nil {
			log.Printf("[NAT] Warning: failed to remove port mapping: %v", err)
		}
		vc.natTraversal = nil
		vc.natInfo = nil
	}

	select {
	case <-vc.rxDone:
	case <-time.After(1 * time.Second):
	}

	select {
	case <-vc.txDone:
	case <-time.After(1 * time.Second):
	}

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
	packet := make([]byte, 1+16+4+len(usernameBytes))
	packet[0] = PacketTypeAuthentication
	copy(packet[1:17], vc.clientID[:])
	binary.BigEndian.PutUint32(packet[17:21], uint32(len(usernameBytes)))
	copy(packet[21:], usernameBytes)

	_, err := vc.socket.WriteToUDP(packet, vc.serverUDPAddr)
	return err
}

func (vc *VoiceClient) waitForAcknowledgment() error {
	buffer := make([]byte, 256)

	for {
		n, _, err := vc.socket.ReadFromUDP(buffer)
		if err != nil {
			return err
		}

		if n < 20 {
			continue
		}

		if buffer[0] != PacketTypeAuthAck {
			continue
		}

		ackClientID, accepted, message, ok := parseAuthAck(buffer[:n])
		if !ok {
			continue
		}
		if ackClientID != vc.clientID {
			continue
		}
		if !accepted {
			return fmt.Errorf("authentication rejected: %s", message)
		}
		log.Printf("Received authentication acknowledgment: %s", message)
		return nil
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
				log.Printf("Receive error: %v", err)
			}
			continue
		}

		if n < audioHeaderLegacy {
			continue
		}

		if buffer[0] != PacketTypeAudio && buffer[0] != PacketTypeTestAudio {
			continue
		}

		codec, audioData, pos, ok := parseAudioPayload(buffer[:n])
		if !ok {
			continue
		}

		packetCount++
		if packetCount%100 == 1 {
			log.Printf("Received audio packet #%d, size=%d bytes", packetCount, len(audioData))
		}

		if vc.audioManager != nil {
			samples, err := vc.audioManager.DecodeAudio(codec, audioData)
			if err != nil {
				log.Printf("Error decoding audio: %v", err)
				continue
			}

			stereo := spatialize(samples, pos, positionalMaxDistance)
			if stereo == nil {
				continue
			}

			select {
			case vc.audioManager.GetOutputChannel() <- stereo:
			default:
				if packetCount%100 == 1 {
					log.Printf("Output channel full, dropping packet")
				}
			}
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

	// Equal-power panning with stronger elevation widening: above = wider, below = narrower
	panScale := 1.0 + 1.2*elev
	if panScale < 0.35 {
		panScale = 0.35
	}
	if panScale > 1.8 {
		panScale = 1.8
	}
	pan *= panScale
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

func parseAuthAck(data []byte) (uuid.UUID, bool, string, bool) {
	if len(data) < 20 {
		return uuid.UUID{}, false, "", false
	}
	if data[0] != PacketTypeAuthAck {
		return uuid.UUID{}, false, "", false
	}

	var idBytes [16]byte
	copy(idBytes[:], data[1:17])
	ackClientID, err := uuid.FromBytes(idBytes[:])
	if err != nil {
		return uuid.UUID{}, false, "", false
	}

	accepted := data[17] == 1
	messageLen := binary.BigEndian.Uint16(data[18:20])
	if 20+int(messageLen) > len(data) {
		return uuid.UUID{}, false, "", false
	}
	message := string(data[20 : 20+int(messageLen)])
	return ackClientID, accepted, message, true
}

func parseAudioPayload(data []byte) (byte, []byte, *[3]float32, bool) {
	if len(data) < audioHeaderLegacy {
		return AudioCodecPCM, nil, nil, false
	}

	packetType := data[0]
	if packetType != PacketTypeAudio && packetType != PacketTypeTestAudio {
		return AudioCodecPCM, nil, nil, false
	}

	codecByte := data[1]
	baseCodec := codecByte & 0x7F
	hasPos := (codecByte & 0x80) != 0
	if baseCodec == AudioCodecOpus || baseCodec == AudioCodecPCM {
		if len(data) < audioHeaderWithCodec {
			return AudioCodecPCM, nil, nil, false
		}
		audioLen := binary.BigEndian.Uint32(data[22:26])
		totalLen := audioHeaderWithCodec + int(audioLen)
		if totalLen > len(data) || audioLen == 0 {
			return AudioCodecPCM, nil, nil, false
		}
		var pos *[3]float32
		if hasPos && len(data) >= totalLen+12 {
			pos = &[3]float32{
				math.Float32frombits(binary.BigEndian.Uint32(data[totalLen : totalLen+4])),
				math.Float32frombits(binary.BigEndian.Uint32(data[totalLen+4 : totalLen+8])),
				math.Float32frombits(binary.BigEndian.Uint32(data[totalLen+8 : totalLen+12])),
			}
			log.Printf("[AUDIO_RX] hasPos=true position=(%.2f,%.2f,%.2f)", pos[0], pos[1], pos[2])
		} else if !hasPos {
			log.Printf("[AUDIO_RX] hasPos=false (broadcast/non-positional)")
		}
		return baseCodec, data[26:totalLen], pos, true
	}

	audioLen := binary.BigEndian.Uint32(data[21:25])
	totalLen := audioHeaderLegacy + int(audioLen)
	if totalLen > len(data) || audioLen == 0 {
		return AudioCodecPCM, nil, nil, false
	}
	return AudioCodecPCM, data[25:totalLen], nil, true
}
