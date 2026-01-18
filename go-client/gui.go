//go:build cgo
// +build cgo

package main

import (
	"fmt"
	"image/color"
	"log"
	"strconv"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// GUI represents the voice chat GUI
type GUI struct {
	myApp       fyne.App
	win         fyne.Window
	voiceClient *VoiceClient
	savedConfig *ClientConfig

	// UI Elements
	serverInput   *widget.Entry
	portInput     *widget.Entry
	usernameInput *widget.Entry
	micSelect     *widget.Select
	connectBtn    *widget.Button
	testToneBtn   *widget.Button
	statusLabel   *widget.Label
	volumeSlider  *widget.Slider
}

// NewGUI creates a new GUI instance
func NewGUI(client *VoiceClient) *GUI {
	return &GUI{
		voiceClient: client,
	}
}

// Run starts the GUI application
func (gui *GUI) Run() {
	gui.myApp = app.New()
	gui.win = gui.myApp.NewWindow("Hytale Voice Chat")

	gui.setupUI()

	gui.win.Resize(fyne.NewSize(400, 300))
	gui.win.CenterOnScreen()
	gui.win.ShowAndRun()
}

func (gui *GUI) setupUI() {
	// Title
	title := canvas.NewText("Hytale Voice Chat", color.White)
	title.TextSize = 24
	title.TextStyle = fyne.TextStyle{Bold: true}
	title.Alignment = fyne.TextAlignCenter

	// Server input
	gui.serverInput = widget.NewEntry()
	gui.serverInput.SetPlaceHolder("Server Address")
	gui.serverInput.SetText("localhost")

	// Port input
	gui.portInput = widget.NewEntry()
	gui.portInput.SetPlaceHolder("Port")
	gui.portInput.SetText("24454")

	// Username input
	gui.usernameInput = widget.NewEntry()
	gui.usernameInput.SetPlaceHolder("Username")
	gui.usernameInput.SetText("Player")

	gui.loadSavedConfig()

	// Microphone selection
	micOptions, err := ListInputDevices()
	if err != nil {
		micOptions = []string{DefaultDeviceLabel}
		gui.statusLabel = widget.NewLabel("Audio devices unavailable")
	} else {
		gui.statusLabel = widget.NewLabel("Disconnected")
	}
	gui.micSelect = widget.NewSelect(micOptions, func(selected string) {
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, selected)
	})
	gui.micSelect.SetSelected(DefaultDeviceLabel)
	gui.applySavedMicSelection()

	// Status label
	gui.statusLabel.Alignment = fyne.TextAlignCenter

	// Connect button
	gui.connectBtn = widget.NewButton("Connect", gui.onConnectClicked)

	// Test tone button
	gui.testToneBtn = widget.NewButton("Send Test Tone", gui.onTestToneClicked)

	// Volume slider
	volumeLabel := widget.NewLabel("Volume:")
	gui.volumeSlider = widget.NewSlider(0, 100)
	gui.volumeSlider.SetValue(80)
	gui.volumeSlider.OnChanged = func(value float64) {
		// Volume control would go here
	}

	// Layout
	form := container.NewVBox(
		widget.NewLabel("Server:"),
		gui.serverInput,
		widget.NewLabel("Port:"),
		gui.portInput,
		widget.NewLabel("Username:"),
		gui.usernameInput,
		widget.NewLabel("Microphone:"),
		gui.micSelect,
	)

	volumeBox := container.NewBorder(nil, nil, volumeLabel, nil, gui.volumeSlider)

	content := container.NewVBox(
		title,
		widget.NewSeparator(),
		form,
		widget.NewSeparator(),
		gui.connectBtn,
		gui.testToneBtn,
		gui.statusLabel,
		widget.NewSeparator(),
		volumeBox,
	)

	gui.win.SetContent(container.NewPadded(content))
}

func (gui *GUI) onConnectClicked() {
	if gui.voiceClient.connected.Load() {
		gui.voiceClient.Disconnect()
		gui.connectBtn.SetText("Connect")
		gui.statusLabel.SetText("Disconnected")
		return
	}

	server := gui.serverInput.Text
	portStr := gui.portInput.Text
	username := gui.usernameInput.Text

	port, err := strconv.Atoi(portStr)
	if err != nil {
		gui.statusLabel.SetText("Invalid port number")
		return
	}

	gui.saveConfig(server, port, username, gui.micSelect.Selected)

	gui.statusLabel.SetText("Connecting...")
	gui.connectBtn.Disable()

	go func() {
		selectedMic := gui.micSelect.Selected
		err := gui.voiceClient.Connect(server, port, username, selectedMic)
		if err != nil {
			gui.statusLabel.SetText(fmt.Sprintf("Error: %v", err))
			gui.connectBtn.Enable()
			return
		}

		gui.statusLabel.SetText(fmt.Sprintf("Connected as %s", username))
		gui.connectBtn.SetText("Disconnect")
		gui.connectBtn.Enable()
	}()
}

func (gui *GUI) onTestToneClicked() {
	if !gui.voiceClient.connected.Load() {
		gui.statusLabel.SetText("Connect first to send test tone")
		return
	}

	gui.testToneBtn.Disable()
	gui.statusLabel.SetText("Sending test tone...")

	go func() {
		err := gui.voiceClient.SendTestTone(1 * time.Second)
		if err != nil {
			gui.statusLabel.SetText(fmt.Sprintf("Test tone error: %v", err))
		} else {
			gui.statusLabel.SetText("Test tone sent")
		}
		gui.testToneBtn.Enable()
	}()
}

func (gui *GUI) loadSavedConfig() {
	cfg, err := loadClientConfig()
	if err != nil {
		log.Printf("Failed to load config: %v", err)
		return
	}

	gui.savedConfig = &cfg
	if cfg.Server != "" {
		gui.serverInput.SetText(cfg.Server)
	}
	if cfg.Port > 0 {
		gui.portInput.SetText(strconv.Itoa(cfg.Port))
	}
	if cfg.Username != "" {
		gui.usernameInput.SetText(cfg.Username)
	}
}

func (gui *GUI) saveConfig(server string, port int, username string, micLabel string) {
	cfg := ClientConfig{
		Server:   server,
		Port:     port,
		Username: username,
		MicLabel: micLabel,
	}
	if err := saveClientConfig(cfg); err != nil {
		log.Printf("Failed to save config: %v", err)
	}
}

func (gui *GUI) applySavedMicSelection() {
	if gui.savedConfig == nil || gui.savedConfig.MicLabel == "" {
		return
	}

	for _, option := range gui.micSelect.Options {
		if option == gui.savedConfig.MicLabel {
			gui.micSelect.SetSelected(gui.savedConfig.MicLabel)
			return
		}
	}
}

func (gui *GUI) parsePort() int {
	port, err := strconv.Atoi(gui.portInput.Text)
	if err != nil {
		return 0
	}
	return port
}
