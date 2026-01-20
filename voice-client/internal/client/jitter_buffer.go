package client

import (
	"container/heap"
	"sync"
	"time"
)

// JitterBufferPacket represents a packet in the jitter buffer
type JitterBufferPacket struct {
	sequenceNumber uint32
	audioData      []byte
	codec          byte
	position       *[3]float32
	timestamp      time.Time
	index          int // heap index
}

// JitterBuffer reorders packets and handles packet loss with PLC
type JitterBuffer struct {
	mu             sync.Mutex
	packets        packetHeap
	maxSize        int
	minDelay       time.Duration
	lastPlayed     uint32
	initialized    bool
	audioManager   *SimpleAudioManager
	outputChan     chan<- []int16
	maxDistance    float64
}

// packetHeap implements heap.Interface for sequence-ordered packets
type packetHeap []*JitterBufferPacket

func (h packetHeap) Len() int           { return len(h) }
func (h packetHeap) Less(i, j int) bool { return h[i].sequenceNumber < h[j].sequenceNumber }
func (h packetHeap) Swap(i, j int) {
	h[i], h[j] = h[j], h[i]
	h[i].index = i
	h[j].index = j
}
func (h *packetHeap) Push(x interface{}) {
	n := len(*h)
	packet := x.(*JitterBufferPacket)
	packet.index = n
	*h = append(*h, packet)
}
func (h *packetHeap) Pop() interface{} {
	old := *h
	n := len(old)
	packet := old[n-1]
	old[n-1] = nil
	packet.index = -1
	*h = old[0 : n-1]
	return packet
}

// NewJitterBuffer creates a new jitter buffer
func NewJitterBuffer(audioManager *SimpleAudioManager, outputChan chan<- []int16, maxDistance float64, bufferMs int) *JitterBuffer {
	if bufferMs < 20 {
		bufferMs = 20 // Minimum 20ms
	}
	if bufferMs > 200 {
		bufferMs = 200 // Maximum 200ms
	}
	
	jb := &JitterBuffer{
		packets:      make(packetHeap, 0, bufferMs/20), // ~1 packet per 20ms
		maxSize:      bufferMs / 20,
		minDelay:     time.Duration(bufferMs) * time.Millisecond,
		audioManager: audioManager,
		outputChan:   outputChan,
		maxDistance:  maxDistance,
	}
	heap.Init(&jb.packets)
	return jb
}

// AddPacket adds a packet to the jitter buffer
func (jb *JitterBuffer) AddPacket(sequenceNumber uint32, audioData []byte, codec byte, position *[3]float32) {
	jb.mu.Lock()
	defer jb.mu.Unlock()
	
	// Initialize on first packet
	if !jb.initialized {
		jb.lastPlayed = sequenceNumber - 1
		jb.initialized = true
	}
	
	// Discard duplicate or very old packets
	if sequenceNumber <= jb.lastPlayed {
		return
	}
	
	// Create packet
	packet := &JitterBufferPacket{
		sequenceNumber: sequenceNumber,
		audioData:      audioData,
		codec:          codec,
		position:       position,
		timestamp:      time.Now(),
	}
	
	// Add to heap
	heap.Push(&jb.packets, packet)
	
	// Limit buffer size (drop oldest packets if full)
	for jb.packets.Len() > jb.maxSize {
		heap.Pop(&jb.packets)
	}
}

// PlayNextPacket plays the next packet in sequence, using PLC if needed
func (jb *JitterBuffer) PlayNextPacket() bool {
	jb.mu.Lock()
	defer jb.mu.Unlock()
	
	if !jb.initialized {
		return false
	}
	
	expectedSeq := jb.lastPlayed + 1
	
	// Check if we have the expected packet
	if jb.packets.Len() > 0 {
		nextPacket := jb.packets[0]
		
		// Check if oldest packet is old enough to play
		age := time.Since(nextPacket.timestamp)
		
		// If we have the expected packet and minimum delay passed
		if nextPacket.sequenceNumber == expectedSeq && age >= jb.minDelay {
			packet := heap.Pop(&jb.packets).(*JitterBufferPacket)
			jb.lastPlayed = packet.sequenceNumber
			jb.playPacket(packet)
			return true
		}
		
		// If packet is very late and we should play next available
		if nextPacket.sequenceNumber > expectedSeq && age >= jb.minDelay*2 {
			// Fill gap with PLC
			for seq := expectedSeq; seq < nextPacket.sequenceNumber && seq < expectedSeq+5; seq++ {
				jb.playPLC()
				jb.lastPlayed = seq
			}
			// Then play the late packet
			packet := heap.Pop(&jb.packets).(*JitterBufferPacket)
			jb.lastPlayed = packet.sequenceNumber
			jb.playPacket(packet)
			return true
		}
	} else {
		// No packets in buffer, use PLC
		if jb.initialized {
			jb.playPLC()
			jb.lastPlayed = expectedSeq
			return true
		}
	}
	
	return false
}

// playPacket decodes and plays a packet
func (jb *JitterBuffer) playPacket(packet *JitterBufferPacket) {
	if jb.audioManager == nil || jb.outputChan == nil {
		return
	}
	
	samples, err := jb.audioManager.DecodeAudio(packet.codec, packet.audioData)
	if err != nil {
		// If decode fails, use PLC
		jb.playPLC()
		return
	}
	
	// Apply spatial audio if position data available
	stereo := spatialize(samples, packet.position, jb.maxDistance)
	if stereo == nil {
		return // Too far away
	}
	
	// Send to output
	select {
	case jb.outputChan <- stereo:
	default:
		// Output channel full, drop packet
	}
}

// playPLC plays a PLC frame (synthesized audio for lost packet)
func (jb *JitterBuffer) playPLC() {
	if jb.audioManager == nil || jb.outputChan == nil {
		return
	}
	
	// Use Opus PLC by decoding with nil data
	// The Opus decoder will synthesize a plausible frame
	samples, err := jb.audioManager.DecodeAudio(AudioCodecOpus, nil)
	if err != nil {
		// Fallback to silence
		samples = make([]int16, 960)
	}
	
	// PLC frames are mono and should be converted to stereo with no panning
	stereo := spatialize(samples, nil, jb.maxDistance)
	if stereo == nil {
		stereo = make([]int16, len(samples)*2)
		for i := 0; i < len(samples); i++ {
			stereo[2*i] = samples[i]
			stereo[2*i+1] = samples[i]
		}
	}
	
	// Send to output
	select {
	case jb.outputChan <- stereo:
	default:
		// Output channel full
	}
}

// Flush clears all buffered packets
func (jb *JitterBuffer) Flush() {
	jb.mu.Lock()
	defer jb.mu.Unlock()
	
	jb.packets = make(packetHeap, 0, jb.maxSize)
	heap.Init(&jb.packets)
}

// GetBufferSize returns the current number of packets in buffer
func (jb *JitterBuffer) GetBufferSize() int {
	jb.mu.Lock()
	defer jb.mu.Unlock()
	return jb.packets.Len()
}
