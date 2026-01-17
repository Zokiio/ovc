package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

const (
	PacketTypeAudio          = 0x00
	PacketTypeAuthentication = 0x01
	PacketTypeAuthAck        = 0x02
	AuthTimeoutSeconds       = 5
)

type VoiceClient struct {
	clientID       uuid.UUID
	username       string
	serverAddr     string
	serverPort     int
	serverUDPAddr  *net.UDPAddr
	socket         *net.UDPConn
	audioManager   *SimpleAudioManager
	connected      atomic.Bool
	sequenceNumber atomic.Uint32
	rxDone         chan struct{}
	txDone         chan struct{}
	mu             sync.Mutex
}

func NewVoiceClient() *VoiceClient {
	return &VoiceClient{
		clientID: uuid.New(),
		rxDone:   make(chan struct{}, 1),
		txDone:   make(chan struct{}, 1),
	}
}

func (vc *VoiceClient) GetClientID() uuid.UUID {
	return vc.clientID
}

func (vc *VoiceClient) Connect(serverAddr string, serverPort int, username string) error {
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
	audioManager, err := NewSimpleAudioManager()
	if err != nil {
		return fmt.Errorf("failed to initialize audio: %w", err)
	}
	vc.audioManager = audioManager

	if err := vc.audioManager.Start(); err != nil {
		return fmt.Errorf("failed to start audio: %w", err)
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

	// Send authentication packet
	if err := vc.sendAuthentication(); err != nil {
		vc.socket.Close()
		vc.audioManager.Stop()
		return fmt.Errorf("failed to send authentication: %w", err)
	}

	// Wait for server acknowledgment
	socket.SetReadDeadline(time.Now().Add(time.Duration(AuthTimeoutSeconds) * time.Second))
	if err := vc.waitForAcknowledgment(); err != nil {
		vc.socket.Close()
		vc.audioManager.Stop()
		return fmt.Errorf("server did not acknowledge authentication: %w", err)
	}

	log.Println("Server acknowledged connection")
	vc.connected.Store(true)
	socket.SetReadDeadline(time.Time{})

	// Start goroutines
	go vc.transmitLoop()
	go vc.receiveLoop()

	return nil
}

func (vc *VoiceClient) Disconnect() error {
	vc.mu.Lock()
	defer vc.mu.Unlock()

	if !vc.connected.Load() {
		return nil
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

func (vc *VoiceClient) sendAuthentication() error {
	packet := make([]byte, 1+16+len(vc.username))
	packet[0] = PacketTypeAuthentication
	copy(packet[1:17], vc.clientID[:])
	copy(packet[17:], []byte(vc.username))

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

		if n < 18 {
			continue
		}

		if buffer[0] == PacketTypeAuthAck {
			log.Println("Received authentication acknowledgment")
			return nil
		}
	}
}

func (vc *VoiceClient) receiveLoop() {
	defer func() { vc.rxDone <- struct{}{} }()

	buffer := make([]byte, 4096)

	for vc.connected.Load() {
		n, _, err := vc.socket.ReadFromUDP(buffer)
		if err != nil {
			if vc.connected.Load() {
				log.Printf("Receive error: %v", err)
			}
			continue
		}

		if n < 21 {
			continue
		}

		if buffer[0] == PacketTypeAudio {
			audioData := buffer[21:n]

			if vc.audioManager != nil {
				samples, err := vc.audioManager.DecodeAudio(audioData)
				if err != nil {
					log.Printf("Error decoding audio: %v", err)
					continue
				}

				select {
				case vc.audioManager.GetOutputChannel() <- samples:
				default:
				}
			}
		}
	}
}

func (vc *VoiceClient) transmitLoop() {
	defer func() { vc.txDone <- struct{}{} }()

	inputChan := vc.audioManager.GetInputChannel()

	for vc.connected.Load() {
		select {
		case samples := <-inputChan:
			if len(samples) == 0 {
				continue
			}

			audioData, err := vc.audioManager.EncodeAudio(samples)
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

func (vc *VoiceClient) sendAudioPacket(audioData []byte) error {
	seqNum := vc.sequenceNumber.Add(1) - 1

	packet := make([]byte, 21+len(audioData))
	packet[0] = PacketTypeAudio
	copy(packet[1:17], vc.clientID[:])
	binary.LittleEndian.PutUint32(packet[17:21], seqNum)
	copy(packet[21:], audioData)

	_, err := vc.socket.WriteToUDP(packet, vc.serverUDPAddr)
	return err
}
