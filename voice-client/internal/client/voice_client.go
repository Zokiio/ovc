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
	jitterBufferDepth        = 4 // 80ms buffer at 20ms per frame
	bufferDrainInterval      = 20 * time.Millisecond
	senderInactivityTimeout  = 30 * time.Second       // Remove buffers after 30s of inactivity
	defaultMaxWaitTime       = 100 * time.Millisecond // Default max wait for late packets (handles network jitter)
)

// JitterBufferPacket represents a buffered audio packet with metadata
type JitterBufferPacket struct {
	sequenceNumber uint32
	codec          byte
	audioData      []byte
	position       *[3]float32
	timestamp      time.Time
}

// SenderBuffer manages packets from a single sender
type SenderBuffer struct {
	senderID        uuid.UUID
	packets         map[uint32]*JitterBufferPacket
	expectedSeqNum  uint32
	lastPlayoutTime time.Time
	lastActivity    time.Time // Track last packet received time for cleanup
	mu              sync.Mutex
	latePackets     uint64      // stats
	gapsConcealed   uint64      // stats
	bufferUnderruns uint64      // stats
	initialized     bool        // whether expectedSeqNum has been initialized
	decoder         interface{} // Per-sender Opus decoder for proper PLC (type *opus.Decoder, but stored as interface{} to avoid build tag issues)
}

// seqNumLessThan compares sequence numbers with wraparound handling
// Returns true if a comes before b in the sequence space
func seqNumLessThan(a, b uint32) bool {
	const maxDelta uint32 = 1 << 31 // Half of uint32 range
	diff := b - a
	// If diff is in the range [1, maxDelta], then a < b
	// If diff > maxDelta, then we've wrapped around and b < a
	return diff > 0 && diff <= maxDelta
}

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

	// Jitter buffer management
	senderBuffers       map[uuid.UUID]*SenderBuffer // per-sender jitter buffers
	jitterBufferMu      sync.RWMutex
	jitterBufferDepth   int           // configurable buffer depth (3-5 packets)
	maxWaitTime         time.Duration // max time to wait for late packets
	jitterBufferEnabled atomic.Bool   // enable/disable jitter buffer
	plcEnabled          atomic.Bool   // enable/disable PLC
}

func NewVoiceClient() *VoiceClient {
	vc := &VoiceClient{
		clientID:          uuid.New(),
		rxDone:            make(chan struct{}, 1),
		txDone:            make(chan struct{}, 1),
		codec:             AudioCodecOpus,
		pttKey:            "Space",
		masterVolume:      1.0,
		micGain:           1.0,
		senderBuffers:     make(map[uuid.UUID]*SenderBuffer),
		jitterBufferDepth: jitterBufferDepth,
		maxWaitTime:       defaultMaxWaitTime,
	}
	vc.vadEnabled.Store(true)
	vc.vadThreshold.Store(vadThresholdDefault)
	vc.vadHangoverFrames.Store(vadHangoverFramesDefault)
	vc.pttEnabled.Store(false)
	vc.jitterBufferEnabled.Store(true)
	vc.plcEnabled.Store(true)
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

// SetJitterBuffer configures jitter buffer settings
// Note: Depth changes take effect on next drain cycle; existing buffered packets retain old behavior
func (vc *VoiceClient) SetJitterBuffer(enabled bool, depthPackets int) {
	vc.jitterBufferEnabled.Store(enabled)
	if depthPackets >= 2 && depthPackets <= 10 {
		vc.jitterBufferMu.Lock()
		vc.jitterBufferDepth = depthPackets
		vc.jitterBufferMu.Unlock()
	}
}

// SetJitterBufferMaxWait configures maximum wait time for late packets
func (vc *VoiceClient) SetJitterBufferMaxWait(maxWait time.Duration) {
	if maxWait >= 20*time.Millisecond && maxWait <= 500*time.Millisecond {
		vc.jitterBufferMu.Lock()
		vc.maxWaitTime = maxWait
		vc.jitterBufferMu.Unlock()
	}
}

// SetPacketLossConcealment enables/disables PLC
func (vc *VoiceClient) SetPacketLossConcealment(enabled bool) {
	vc.plcEnabled.Store(enabled)
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

// getOrCreateSenderBuffer retrieves or creates a jitter buffer for a sender
func (vc *VoiceClient) getOrCreateSenderBuffer(senderID uuid.UUID) *SenderBuffer {
	vc.jitterBufferMu.Lock()
	defer vc.jitterBufferMu.Unlock()

	if sb, exists := vc.senderBuffers[senderID]; exists {
		return sb
	}

	sb := &SenderBuffer{
		senderID:        senderID,
		packets:         make(map[uint32]*JitterBufferPacket),
		expectedSeqNum:  0,
		lastPlayoutTime: time.Now(),
		lastActivity:    time.Now(),
	}

	// Create per-sender decoder for proper PLC
	if vc.audioManager != nil {
		decoder, err := vc.audioManager.CreateSenderDecoder()
		if err != nil {
			log.Printf("Warning: Failed to create decoder for sender %s: %v", senderID.String()[:8], err)
		} else {
			sb.decoder = decoder
		}
	}

	vc.senderBuffers[senderID] = sb
	log.Printf("Created jitter buffer for sender %s", senderID.String()[:8])
	return sb
}

// bufferPacket stores a packet in the jitter buffer
func (sb *SenderBuffer) bufferPacket(seqNum uint32, codec byte, audioData []byte, position *[3]float32) {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	// Update activity timestamp
	sb.lastActivity = time.Now()

	// Initialize expectedSeqNum to the first packet received
	if !sb.initialized {
		sb.expectedSeqNum = seqNum
		sb.initialized = true
		log.Printf("Initialized jitter buffer for sender %s with seq=%d", sb.senderID.String()[:8], seqNum)
	}

	// Check if this is a late packet (already played or dropped)
	if seqNumLessThan(seqNum, sb.expectedSeqNum) {
		sb.latePackets++
		log.Printf("Late packet from sender %s: seq=%d, expected=%d", sb.senderID.String()[:8], seqNum, sb.expectedSeqNum)
		return
	}

	// Make a defensive copy of the position so buffered packets are not affected
	// if the caller reuses or mutates the original array.
	var posCopy *[3]float32
	if position != nil {
		p := *position
		posCopy = &p
	}

	sb.packets[seqNum] = &JitterBufferPacket{
		sequenceNumber: seqNum,
		codec:          codec,
		audioData:      make([]byte, len(audioData)),
		position:       posCopy,
		timestamp:      time.Now(),
	}
	copy(sb.packets[seqNum].audioData, audioData)
}

// drainBuffer returns all playable packets and detects gaps
// Returns: []packets (in order), []gaps (sequence numbers skipped at playout time for which PLC should be applied; packets may still arrive later as late packets)
func (sb *SenderBuffer) drainBuffer(maxBufferDepth int, maxWaitTime time.Duration) ([]*JitterBufferPacket, []uint32) {
	sb.mu.Lock()
	defer sb.mu.Unlock()

	var playable []*JitterBufferPacket
	var gaps []uint32

	now := time.Now()

	for {
		packet, exists := sb.packets[sb.expectedSeqNum]
		if !exists {
			// Check if buffer is full or timeout reached
			bufferSize := len(sb.packets)
			maxSeqInBuffer := sb.expectedSeqNum
			for seq := range sb.packets {
				if seq > maxSeqInBuffer {
					maxSeqInBuffer = seq
				}
			}

			timeWaiting := now.Sub(sb.lastPlayoutTime)
			if bufferSize >= maxBufferDepth || timeWaiting > maxWaitTime {
				// Force playout: mark gap and advance expected
				gaps = append(gaps, sb.expectedSeqNum)
				sb.expectedSeqNum++
				if timeWaiting > maxWaitTime {
					sb.bufferUnderruns++
				}
				continue
			}
			break
		}

		// Packet is available, add to playable
		playable = append(playable, packet)
		delete(sb.packets, sb.expectedSeqNum)
		sb.expectedSeqNum++
		sb.lastPlayoutTime = now
	}

	if len(gaps) > 0 {
		sb.gapsConcealed += uint64(len(gaps))
	}

	return playable, gaps
}

// getBufferStats returns current buffer statistics
func (sb *SenderBuffer) getBufferStats() (bufferSize int, latePackets, gapsConcealed, underruns uint64) {
	sb.mu.Lock()
	defer sb.mu.Unlock()
	return len(sb.packets), sb.latePackets, sb.gapsConcealed, sb.bufferUnderruns
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

	// Timer for periodic buffer draining
	drainTicker := time.NewTicker(bufferDrainInterval)
	defer drainTicker.Stop()

	// Stats reporting timer
	statsTicker := time.NewTicker(5 * time.Second)
	defer statsTicker.Stop()

	// Cleanup timer for inactive sender buffers
	cleanupTicker := time.NewTicker(30 * time.Second)
	defer cleanupTicker.Stop()

	// Set a longer read deadline to avoid tight looping
	vc.socket.SetReadDeadline(time.Time{}) // Clear any existing deadline

	for vc.connected.Load() {
		select {
		case <-drainTicker.C:
			// Periodically drain all jitter buffers and process packets
			vc.drainAllBuffers()

		case <-statsTicker.C:
			// Log buffer statistics
			vc.logBufferStats()

		case <-cleanupTicker.C:
			// Clean up inactive sender buffers
			vc.cleanupInactiveSenders()

		default:
			// Try to read a packet with a reasonable timeout
			vc.socket.SetReadDeadline(time.Now().Add(10 * time.Millisecond))
			n, _, err := vc.socket.ReadFromUDP(buffer)
			if err != nil {
				if vc.connected.Load() {
					// Ignore timeout errors, they're expected
					if netErr, ok := err.(net.Error); !ok || !netErr.Timeout() {
						log.Printf("Receive error: %v", err)
					}
				}
				// Sleep briefly to prevent tight looping on repeated errors
				time.Sleep(time.Millisecond)
				continue
			}

			if n < audioHeaderLegacy {
				continue
			}

			if buffer[0] != PacketTypeAudio && buffer[0] != PacketTypeTestAudio {
				continue
			}

			// Parse packet and extract sender, sequence number, codec, etc.
			senderID, seqNum, codec, audioData, pos, ok := parseAudioPayload(buffer[:n])
			if !ok {
				continue
			}

			packetCount++
			if packetCount%100 == 1 {
				log.Printf("Received audio packet #%d, seq=%d, sender=%s, size=%d bytes",
					packetCount, seqNum, senderID.String()[:8], len(audioData))
			}

			// If jitter buffer is disabled, process immediately
			if !vc.jitterBufferEnabled.Load() {
				vc.processAudioPacket(codec, audioData, pos)
				continue
			}

			// Buffer the packet in the per-sender jitter buffer
			senderBuf := vc.getOrCreateSenderBuffer(senderID)
			senderBuf.bufferPacket(seqNum, codec, audioData, pos)
		}
	}
}

// drainAllBuffers processes all pending packets from all sender buffers
func (vc *VoiceClient) drainAllBuffers() {
	if !vc.jitterBufferEnabled.Load() {
		return
	}

	// Read jitterBufferDepth and maxWaitTime under lock to avoid data races.
	vc.jitterBufferMu.RLock()
	depth := vc.jitterBufferDepth
	maxWait := vc.maxWaitTime
	senders := make([]uuid.UUID, 0, len(vc.senderBuffers))
	for senderID := range vc.senderBuffers {
		senders = append(senders, senderID)
	}
	vc.jitterBufferMu.RUnlock()

	for _, senderID := range senders {
		vc.jitterBufferMu.RLock()
		sb, exists := vc.senderBuffers[senderID]
		vc.jitterBufferMu.RUnlock()

		if !exists {
			continue
		}

		// Drain the buffer: get playable packets and gaps
		playablePackets, gaps := sb.drainBuffer(depth, maxWait)

		// Process playable packets with per-sender decoder
		for _, pkt := range playablePackets {
			vc.processAudioPacketWithDecoder(pkt.codec, pkt.audioData, pkt.position, sb.decoder)
		}

		// Handle gaps with packet loss concealment using per-sender decoder
		if len(gaps) > 0 && vc.plcEnabled.Load() {
			for range gaps {
				vc.processPLCWithDecoder(sb.decoder)
			}
		}
	}
}

// processAudioPacket decodes and plays an audio packet (legacy, no per-sender decoder)
func (vc *VoiceClient) processAudioPacket(codec byte, audioData []byte, pos *[3]float32) {
	vc.processAudioPacketWithDecoder(codec, audioData, pos, nil)
}

// processAudioPacketWithDecoder decodes and plays an audio packet using a per-sender decoder
func (vc *VoiceClient) processAudioPacketWithDecoder(codec byte, audioData []byte, pos *[3]float32, senderDecoder interface{}) {
	if vc.audioManager == nil {
		return
	}

	samples, err := vc.audioManager.DecodeAudioWithSenderDecoder(codec, audioData, senderDecoder)
	if err != nil {
		log.Printf("Error decoding audio: %v", err)
		return
	}

	stereo := spatialize(samples, pos, positionalMaxDistance)
	if stereo == nil {
		return
	}

	select {
	case vc.audioManager.GetOutputChannel() <- stereo:
	default:
		log.Printf("Output channel full, dropping packet")
	}
}

// processPLC handles a missing packet by triggering Opus PLC (Packet Loss Concealment)
// Legacy method without per-sender decoder
func (vc *VoiceClient) processPLC() {
	vc.processPLCWithDecoder(nil)
}

// processPLCWithDecoder handles a missing packet using per-sender decoder for proper PLC
func (vc *VoiceClient) processPLCWithDecoder(senderDecoder interface{}) {
	if vc.audioManager == nil {
		return
	}

	// Trigger PLC by decoding nil data with per-sender decoder
	samples, err := vc.audioManager.DecodeAudioWithSenderDecoder(AudioCodecOpus, nil, senderDecoder)
	if err != nil {
		log.Printf("Error in PLC: %v", err)
		return
	}

	stereo := spatialize(samples, nil, positionalMaxDistance)
	if stereo == nil {
		return
	}

	select {
	case vc.audioManager.GetOutputChannel() <- stereo:
	default:
		log.Printf("Output channel full, dropping PLC frame")
	}
}

// logBufferStats logs statistics from all jitter buffers
func (vc *VoiceClient) logBufferStats() {
	vc.jitterBufferMu.RLock()
	defer vc.jitterBufferMu.RUnlock()

	if len(vc.senderBuffers) == 0 {
		return
	}

	for senderID, sb := range vc.senderBuffers {
		bufSize, latePackets, gapsConcealed, underruns := sb.getBufferStats()
		log.Printf("[JITTER_BUFFER] sender=%s bufSize=%d latePackets=%d gapsConcealed=%d underruns=%d",
			senderID.String()[:8], bufSize, latePackets, gapsConcealed, underruns)
	}
}

// cleanupInactiveSenders removes sender buffers that haven't received packets recently
func (vc *VoiceClient) cleanupInactiveSenders() {
	vc.jitterBufferMu.Lock()
	defer vc.jitterBufferMu.Unlock()

	now := time.Now()
	var removed []uuid.UUID

	for senderID, sb := range vc.senderBuffers {
		sb.mu.Lock()
		lastActivity := sb.lastActivity
		sb.mu.Unlock()

		if now.Sub(lastActivity) > senderInactivityTimeout {
			delete(vc.senderBuffers, senderID)
			removed = append(removed, senderID)
		}
	}

	if len(removed) > 0 {
		log.Printf("Cleaned up %d inactive sender buffer(s)", len(removed))
		for _, id := range removed {
			log.Printf("  Removed buffer for sender %s", id.String()[:8])
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

func parseAudioPayload(data []byte) (senderID uuid.UUID, seqNum uint32, codec byte, audioData []byte, pos *[3]float32, ok bool) {
	if len(data) < audioHeaderLegacy {
		return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
	}

	packetType := data[0]
	if packetType != PacketTypeAudio && packetType != PacketTypeTestAudio {
		return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
	}

	codecByte := data[1]
	baseCodec := codecByte & 0x7F
	hasPos := (codecByte & 0x80) != 0

	// Check if this is the new format (with codec byte) or legacy format
	if baseCodec == AudioCodecOpus || baseCodec == AudioCodecPCM {
		// New format with codec byte at position 1
		if len(data) < audioHeaderWithCodec {
			return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
		}

		// Extract sender ID from bytes 2-18 and sequence number from bytes 18-22
		var senderIDBytes [16]byte
		copy(senderIDBytes[:], data[2:18])
		senderID, err := uuid.FromBytes(senderIDBytes[:])
		if err != nil {
			return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
		}
		seqNum = binary.BigEndian.Uint32(data[18:22])

		audioLen := binary.BigEndian.Uint32(data[22:26])
		totalLen := audioHeaderWithCodec + int(audioLen)
		if totalLen > len(data) || audioLen == 0 {
			return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
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
		return senderID, seqNum, baseCodec, data[26:totalLen], pos, true
	}

	// Legacy format without codec byte
	// Extract sender ID from bytes 1-17 and sequence number from bytes 17-21
	var senderIDBytes [16]byte
	copy(senderIDBytes[:], data[1:17])
	senderID, err := uuid.FromBytes(senderIDBytes[:])
	if err != nil {
		return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
	}
	seqNum = binary.BigEndian.Uint32(data[17:21])

	audioLen := binary.BigEndian.Uint32(data[21:25])
	totalLen := audioHeaderLegacy + int(audioLen)
	if totalLen > len(data) || audioLen == 0 {
		return uuid.UUID{}, 0, AudioCodecPCM, nil, nil, false
	}
	return senderID, seqNum, AudioCodecPCM, data[25:totalLen], nil, true
}
