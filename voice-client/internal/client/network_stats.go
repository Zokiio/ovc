package client

import (
	"sync"
	"time"
)

// NetworkStats tracks network quality metrics
type NetworkStats struct {
	mu                  sync.RWMutex
	packetsReceived     uint64
	packetsLost         uint64
	packetsOutOfOrder   uint64
	lastSequenceNumber  uint32
	sequenceInitialized bool

	// Rolling window for packet loss calculation
	recentPackets uint64
	recentLost    uint64
	windowSize    uint64

	// Jitter and latency tracking
	lastPacketTime time.Time
	jitterSum      float64
	jitterCount    int64
	avgJitter      float64
}

// NewNetworkStats creates a new network statistics tracker
func NewNetworkStats() *NetworkStats {
	return &NetworkStats{
		windowSize: 1000, // Track last 1000 packets for rolling average
	}
}

// RecordPacket records a received packet and updates sequence tracking
func (ns *NetworkStats) RecordPacket(sequenceNumber uint32) (lost int) {
	ns.mu.Lock()
	defer ns.mu.Unlock()

	now := time.Now()

	// Initialize on first packet
	if !ns.sequenceInitialized {
		ns.lastSequenceNumber = sequenceNumber
		ns.sequenceInitialized = true
		ns.lastPacketTime = now
		ns.packetsReceived++
		ns.recentPackets++
		return 0
	}

	// Calculate expected sequence number
	expectedSeq := ns.lastSequenceNumber + 1

	// Check for packet loss or reordering
	var lostPackets int
	if sequenceNumber > expectedSeq {
		// Packets lost (gap detected)
		lostPackets = int(sequenceNumber - expectedSeq)
		ns.packetsLost += uint64(lostPackets)
		ns.recentLost += uint64(lostPackets)
	} else if sequenceNumber < expectedSeq {
		// Out-of-order packet (arrived late)
		ns.packetsOutOfOrder++
		// Don't count as received in expected order
		return 0
	}

	ns.packetsReceived++
	ns.recentPackets++
	ns.lastSequenceNumber = sequenceNumber

	// Calculate jitter (inter-arrival time variation)
	if !ns.lastPacketTime.IsZero() {
		interval := now.Sub(ns.lastPacketTime).Seconds()
		expectedInterval := 0.020 // 20ms frame time
		jitter := interval - expectedInterval
		if jitter < 0 {
			jitter = -jitter
		}
		ns.jitterSum += jitter
		ns.jitterCount++
		if ns.jitterCount > 0 {
			ns.avgJitter = ns.jitterSum / float64(ns.jitterCount)
		}
	}
	ns.lastPacketTime = now

	// Maintain rolling window
	if ns.recentPackets > ns.windowSize {
		ns.recentPackets = ns.windowSize
		ns.recentLost = uint64(float64(ns.recentLost) * 0.9) // Decay old losses
	}

	return lostPackets
}

// GetPacketLossPercent returns the packet loss percentage (0-100)
func (ns *NetworkStats) GetPacketLossPercent() float64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()

	if ns.recentPackets == 0 {
		return 0.0
	}

	return (float64(ns.recentLost) / float64(ns.recentPackets)) * 100.0
}

// GetTotalPacketsReceived returns the total number of packets received
func (ns *NetworkStats) GetTotalPacketsReceived() uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.packetsReceived
}

// GetTotalPacketsLost returns the total number of packets lost
func (ns *NetworkStats) GetTotalPacketsLost() uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.packetsLost
}

// GetOutOfOrderPackets returns the number of out-of-order packets
func (ns *NetworkStats) GetOutOfOrderPackets() uint64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.packetsOutOfOrder
}

// GetAverageJitter returns the average jitter in milliseconds
func (ns *NetworkStats) GetAverageJitter() float64 {
	ns.mu.RLock()
	defer ns.mu.RUnlock()
	return ns.avgJitter * 1000.0 // Convert to ms
}

// GetNetworkQuality returns a quality rating: "Excellent", "Good", "Fair", "Poor"
func (ns *NetworkStats) GetNetworkQuality() string {
	loss := ns.GetPacketLossPercent()

	if loss < 1.0 {
		return "Excellent"
	} else if loss < 3.0 {
		return "Good"
	} else if loss < 10.0 {
		return "Fair"
	} else {
		return "Poor"
	}
}

// Reset clears all statistics
func (ns *NetworkStats) Reset() {
	ns.mu.Lock()
	defer ns.mu.Unlock()

	ns.packetsReceived = 0
	ns.packetsLost = 0
	ns.packetsOutOfOrder = 0
	ns.sequenceInitialized = false
	ns.recentPackets = 0
	ns.recentLost = 0
	ns.jitterSum = 0
	ns.jitterCount = 0
	ns.avgJitter = 0
	ns.lastPacketTime = time.Time{}
}
