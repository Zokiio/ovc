package client

import (
	"context"
	"fmt"
	"log"
	"net"
	"time"

	"github.com/huin/goupnp/dcps/internetgateway2"
	"github.com/pion/stun"
)

// NATType represents the type of NAT detected
type NATType string

const (
	NATTypeOpen      NATType = "Open"
	NATTypeModerate  NATType = "Moderate"
	NATTypeStrict    NATType = "Strict"
	NATTypeSymmetric NATType = "Symmetric"
	NATTypeUnknown   NATType = "Unknown"
	NATTypeBlocked   NATType = "Blocked"
)

// NATInfo contains information about NAT status
type NATInfo struct {
	Type           NATType
	PublicIP       string
	PublicPort     int
	LocalIP        string
	LocalPort      int
	UPnPAvailable  bool
	UPnPMapped     bool
	STUNResponsive bool
	ErrorMessage   string
}

// NATTraversal handles NAT traversal using UPnP and STUN
type NATTraversal struct {
	localPort      int
	externalPort   int
	upnpClient     *internetgateway2.WANIPConnection1
	mappingActive  bool
	publicEndpoint *net.UDPAddr
	natType        NATType
}

// NewNATTraversal creates a new NAT traversal handler
func NewNATTraversal() *NATTraversal {
	return &NATTraversal{
		natType: NATTypeUnknown,
	}
}

// SetupPortMapping attempts to set up UPnP port mapping for the given local port
func (nt *NATTraversal) SetupPortMapping(localPort int, externalPort int, description string) error {
	nt.localPort = localPort
	nt.externalPort = externalPort

	log.Printf("[NAT] Attempting UPnP port mapping: local=%d, external=%d", localPort, externalPort)

	// Discover UPnP Internet Gateway Device
	clients, _, err := internetgateway2.NewWANIPConnection1Clients()
	if err != nil {
		log.Printf("[NAT] UPnP discovery failed: %v", err)
		return fmt.Errorf("UPnP discovery failed: %w", err)
	}

	if len(clients) == 0 {
		log.Printf("[NAT] No UPnP-enabled gateway found")
		return fmt.Errorf("no UPnP-enabled gateway found")
	}

	// Use the first available client
	nt.upnpClient = clients[0]
	log.Printf("[NAT] Found UPnP gateway")

	// Get external IP address
	externalIP, err := nt.upnpClient.GetExternalIPAddress()
	if err != nil {
		log.Printf("[NAT] Failed to get external IP: %v", err)
		return fmt.Errorf("failed to get external IP: %w", err)
	}
	log.Printf("[NAT] External IP: %s", externalIP)

	// Get local IP address
	localIP, err := getLocalIP()
	if err != nil {
		log.Printf("[NAT] Failed to get local IP: %v", err)
		return fmt.Errorf("failed to get local IP: %w", err)
	}

	// Add port mapping
	// Protocol: UDP, External Port, Internal Port, Internal Client IP, Enabled, Description, Lease Duration (0 = permanent)
	err = nt.upnpClient.AddPortMapping(
		"",                   // NewRemoteHost (empty for wildcard)
		uint16(externalPort), // NewExternalPort
		"UDP",                // NewProtocol
		uint16(localPort),    // NewInternalPort
		localIP,              // NewInternalClient
		true,                 // NewEnabled
		description,          // NewPortMappingDescription
		0,                    // NewLeaseDuration (0 = permanent)
	)

	if err != nil {
		log.Printf("[NAT] Failed to add port mapping: %v", err)
		return fmt.Errorf("failed to add UPnP port mapping: %w", err)
	}

	nt.mappingActive = true
	log.Printf("[NAT] Successfully created UPnP port mapping: %s:%d -> %s:%d",
		externalIP, externalPort, localIP, localPort)

	return nil
}

// RemovePortMapping removes the UPnP port mapping
func (nt *NATTraversal) RemovePortMapping() error {
	if !nt.mappingActive || nt.upnpClient == nil {
		return nil
	}

	log.Printf("[NAT] Removing UPnP port mapping for external port %d", nt.externalPort)

	err := nt.upnpClient.DeletePortMapping("", uint16(nt.externalPort), "UDP")
	if err != nil {
		log.Printf("[NAT] Failed to remove port mapping: %v", err)
		return fmt.Errorf("failed to remove port mapping: %w", err)
	}

	nt.mappingActive = false
	log.Printf("[NAT] Successfully removed UPnP port mapping")
	return nil
}

// DiscoverPublicEndpoint uses STUN to discover the public IP and port
func (nt *NATTraversal) DiscoverPublicEndpoint(localAddr *net.UDPAddr) (*net.UDPAddr, error) {
	log.Printf("[NAT] Starting STUN discovery from local address %s", localAddr)

	// Use Google's public STUN server
	stunServers := []string{
		"stun.l.google.com:19302",
		"stun1.l.google.com:19302",
		"stun2.l.google.com:19302",
	}

	var lastErr error
	for _, stunServer := range stunServers {
		log.Printf("[NAT] Trying STUN server: %s", stunServer)

		publicAddr, err := nt.performSTUNRequest(localAddr, stunServer)
		if err != nil {
			log.Printf("[NAT] STUN request to %s failed: %v", stunServer, err)
			lastErr = err
			continue
		}

		nt.publicEndpoint = publicAddr
		log.Printf("[NAT] STUN discovery successful: public endpoint = %s", publicAddr)
		return publicAddr, nil
	}

	return nil, fmt.Errorf("all STUN servers failed, last error: %w", lastErr)
}

// performSTUNRequest performs a STUN binding request to discover public endpoint
func (nt *NATTraversal) performSTUNRequest(localAddr *net.UDPAddr, stunServer string) (*net.UDPAddr, error) {
	// Resolve STUN server address
	serverAddr, err := net.ResolveUDPAddr("udp", stunServer)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve STUN server: %w", err)
	}

	// Create UDP connection
	conn, err := net.ListenUDP("udp", localAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to create UDP socket: %w", err)
	}
	defer conn.Close()

	// Set deadline for STUN request
	deadline := time.Now().Add(5 * time.Second)
	conn.SetDeadline(deadline)

	// Create STUN binding request
	message := stun.MustBuild(stun.TransactionID, stun.BindingRequest)

	// Send STUN request
	_, err = conn.WriteToUDP(message.Raw, serverAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to send STUN request: %w", err)
	}

	// Receive STUN response
	buf := make([]byte, 1024)
	n, _, err := conn.ReadFromUDP(buf)
	if err != nil {
		return nil, fmt.Errorf("failed to receive STUN response: %w", err)
	}

	// Parse STUN response
	var response stun.Message
	response.Raw = buf[:n]
	if err := response.Decode(); err != nil {
		return nil, fmt.Errorf("failed to decode STUN response: %w", err)
	}

	// Extract XOR-MAPPED-ADDRESS
	var xorAddr stun.XORMappedAddress
	if err := xorAddr.GetFrom(&response); err != nil {
		return nil, fmt.Errorf("failed to get XOR-MAPPED-ADDRESS: %w", err)
	}

	publicAddr := &net.UDPAddr{
		IP:   xorAddr.IP,
		Port: xorAddr.Port,
	}

	return publicAddr, nil
}

// DetectNATType attempts to detect the type of NAT
func (nt *NATTraversal) DetectNATType(localAddr *net.UDPAddr) (NATType, error) {
	log.Printf("[NAT] Detecting NAT type...")

	// Test 1: Can we reach the internet via STUN?
	publicAddr1, err := nt.DiscoverPublicEndpoint(localAddr)
	if err != nil {
		log.Printf("[NAT] STUN test failed, NAT might be blocking: %v", err)
		nt.natType = NATTypeBlocked
		return NATTypeBlocked, nil
	}

	// Test 2: Check if we're behind NAT
	localIP, err := getLocalIP()
	if err != nil {
		log.Printf("[NAT] Failed to get local IP: %v", err)
		nt.natType = NATTypeUnknown
		return NATTypeUnknown, err
	}

	// If public IP equals local IP, we have a public IP (Open NAT)
	if publicAddr1.IP.String() == localIP {
		log.Printf("[NAT] No NAT detected - public IP matches local IP")
		nt.natType = NATTypeOpen
		return NATTypeOpen, nil
	}

	// Test 3: Multiple STUN requests to detect consistency
	// For symmetric NAT, the external port changes for each destination
	publicAddr2, err := nt.performSTUNRequest(localAddr, "stun2.l.google.com:19302")
	if err == nil && publicAddr2.Port != publicAddr1.Port {
		log.Printf("[NAT] Symmetric NAT detected - external port changes per destination")
		nt.natType = NATTypeSymmetric
		return NATTypeSymmetric, nil
	}

	// Test 4: Check if UPnP is available
	upnpAvailable := nt.isUPnPAvailable()
	if upnpAvailable {
		log.Printf("[NAT] Moderate NAT - UPnP available")
		nt.natType = NATTypeModerate
		return NATTypeModerate, nil
	}

	// Default to Strict NAT if behind NAT but no UPnP
	log.Printf("[NAT] Strict NAT detected - behind NAT without UPnP")
	nt.natType = NATTypeStrict
	return NATTypeStrict, nil
}

// isUPnPAvailable checks if UPnP is available on the network
func (nt *NATTraversal) isUPnPAvailable() bool {
	clients, _, err := internetgateway2.NewWANIPConnection1Clients()
	return err == nil && len(clients) > 0
}

// GetNATInfo returns comprehensive NAT information
func (nt *NATTraversal) GetNATInfo(localAddr *net.UDPAddr) (*NATInfo, error) {
	info := &NATInfo{
		Type:           NATTypeUnknown,
		UPnPAvailable:  false,
		UPnPMapped:     false,
		STUNResponsive: false,
	}

	// Get local IP and port
	localIP, err := getLocalIP()
	if err == nil {
		info.LocalIP = localIP
		if localAddr != nil {
			info.LocalPort = localAddr.Port
		}
	}

	// Check UPnP availability
	info.UPnPAvailable = nt.isUPnPAvailable()
	info.UPnPMapped = nt.mappingActive

	// Try STUN discovery
	publicAddr, err := nt.DiscoverPublicEndpoint(localAddr)
	if err == nil {
		info.STUNResponsive = true
		info.PublicIP = publicAddr.IP.String()
		info.PublicPort = publicAddr.Port
	} else {
		info.ErrorMessage = fmt.Sprintf("STUN failed: %v", err)
	}

	// Detect NAT type
	natType, err := nt.DetectNATType(localAddr)
	if err == nil {
		info.Type = natType
	}

	log.Printf("[NAT] NAT Info: Type=%s, Public=%s:%d, Local=%s:%d, UPnP=%v, STUN=%v",
		info.Type, info.PublicIP, info.PublicPort, info.LocalIP, info.LocalPort,
		info.UPnPAvailable, info.STUNResponsive)

	return info, nil
}

// GetPublicEndpoint returns the discovered public endpoint
func (nt *NATTraversal) GetPublicEndpoint() *net.UDPAddr {
	return nt.publicEndpoint
}

// GetNATType returns the detected NAT type
func (nt *NATTraversal) GetNATType() NATType {
	return nt.natType
}

// IsMappingActive returns whether UPnP mapping is currently active
func (nt *NATTraversal) IsMappingActive() bool {
	return nt.mappingActive
}

// getLocalIP returns the local IP address
func getLocalIP() (string, error) {
	// Create a temporary connection to determine local IP
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "", err
	}
	defer conn.Close()

	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String(), nil
}

// SetupNATWithRetry attempts to set up NAT traversal with automatic retry
func SetupNATWithRetry(ctx context.Context, localPort int, externalPort int, description string) (*NATTraversal, *NATInfo, error) {
	nt := NewNATTraversal()

	// Get local address for STUN
	localAddr := &net.UDPAddr{
		IP:   net.IPv4zero,
		Port: localPort,
	}

	// First, try to get NAT info
	info, err := nt.GetNATInfo(localAddr)
	if err != nil {
		log.Printf("[NAT] Failed to get NAT info: %v", err)
		// Continue anyway, we'll try UPnP
	}

	// Try UPnP port mapping if available
	if info != nil && info.UPnPAvailable {
		log.Printf("[NAT] UPnP is available, attempting port mapping...")
		err := nt.SetupPortMapping(localPort, externalPort, description)
		if err != nil {
			log.Printf("[NAT] UPnP port mapping failed: %v", err)
			// Update info
			if info != nil {
				info.UPnPMapped = false
				info.ErrorMessage = fmt.Sprintf("UPnP mapping failed: %v", err)
			}
		} else {
			log.Printf("[NAT] UPnP port mapping successful")
			if info != nil {
				info.UPnPMapped = true
			}
		}
	} else {
		log.Printf("[NAT] UPnP not available, manual port forwarding required")
	}

	return nt, info, nil
}
