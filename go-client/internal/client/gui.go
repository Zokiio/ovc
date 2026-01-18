//go:build cgo
// +build cgo

package client

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
	speakerSelect *widget.Select
	connectBtn    *widget.Button
	testToneBtn   *widget.Button
	posTestBtn    *widget.Button
	statusLabel   *widget.Label
	volumeSlider  *widget.Slider
	vadCheck      *widget.Check
	vadSlider     *widget.Slider
	vadBar        *canvas.Rectangle
	vadStateLabel *widget.Label
}

const defaultVADThreshold = 1200

// NewGUI creates a new GUI instance
func NewGUI(client *VoiceClient) *GUI {
	return &GUI{
		voiceClient: client,
	}
}

// runOnUI ensures a callback executes on the Fyne UI thread.
func (gui *GUI) runOnUI(fn func()) {
	fyne.Do(fn)
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
	gui.micSelect = widget.NewSelect(micOptions, nil)
	gui.micSelect.SetSelected(DefaultDeviceLabel)

	// Speaker/Output selection
	speakerOptions, err := ListOutputDevices()
	if err != nil {
		speakerOptions = []string{DefaultDeviceLabel}
	}
	gui.speakerSelect = widget.NewSelect(speakerOptions, nil)
	gui.speakerSelect.SetSelected(DefaultDeviceLabel)

	// Set callbacks after both selects are created
	gui.micSelect.OnChanged = func(selected string) {
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold())
	}
	gui.speakerSelect.OnChanged = func(selected string) {
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, selected, gui.vadCheck.Checked, gui.currentVADThreshold())
	}

	// VAD controls
	gui.vadCheck = widget.NewCheck("Voice Activity Detection", func(on bool) {
		gui.voiceClient.SetVAD(on, gui.currentVADThreshold())
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, on, gui.currentVADThreshold())
	})
	gui.vadCheck.SetChecked(true)

	gui.vadSlider = widget.NewSlider(200, 6000)
	gui.vadSlider.Step = 50
	gui.vadSlider.SetValue(defaultVADThreshold)
	gui.vadSlider.OnChanged = func(value float64) {
		gui.voiceClient.SetVAD(gui.vadCheck.Checked, gui.currentVADThreshold())
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold())
	}

	// Status label
	gui.statusLabel.Alignment = fyne.TextAlignCenter

	// Connect button
	gui.connectBtn = widget.NewButton("Connect", gui.onConnectClicked)

	// Test tone buttons
	gui.testToneBtn = widget.NewButton("Send Global Test Tone", gui.onTestToneClicked)
	gui.posTestBtn = widget.NewButton("Send Positional Test", gui.onPositionalTestClicked)

	// Volume slider
	volumeLabel := widget.NewLabel("Volume:")
	gui.volumeSlider = widget.NewSlider(0, 100)
	gui.volumeSlider.SetValue(80)
	gui.volumeSlider.OnChanged = func(value float64) {
		// Volume control would go here
	}

	gui.vadBar = canvas.NewRectangle(color.NRGBA{R: 180, G: 180, B: 180, A: 255})
	gui.vadBar.Resize(fyne.NewSize(120, 10))
	gui.vadStateLabel = widget.NewLabel("VAD: idle")
	gui.voiceClient.SetVADStateListener(func(enabled bool, active bool) {
		gui.runOnUI(func() {
			gui.updateVADIndicator(enabled, active)
		})
	})

	gui.applySavedSettings()

	vadIndicatorRow := container.NewHBox(gui.vadBar, gui.vadStateLabel)
	vadBox := container.NewVBox(
		gui.vadCheck,
		container.NewBorder(nil, nil, widget.NewLabel("Threshold"), nil, gui.vadSlider),
		vadIndicatorRow,
	)

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
		widget.NewLabel("Speaker:"),
		gui.speakerSelect,
	)

	volumeBox := container.NewBorder(nil, nil, volumeLabel, nil, gui.volumeSlider)

	content := container.NewVBox(
		title,
		widget.NewSeparator(),
		form,
		widget.NewSeparator(),
		gui.connectBtn,
		container.NewHBox(gui.testToneBtn, gui.posTestBtn),
		gui.statusLabel,
		widget.NewSeparator(),
		volumeBox,
		vadBox,
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

	gui.saveConfig(server, port, username, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold())

	gui.statusLabel.SetText("Connecting...")
	gui.connectBtn.Disable()

	go func() {
		selectedMic := gui.micSelect.Selected
		selectedSpeaker := gui.speakerSelect.Selected
		err := gui.voiceClient.Connect(server, port, username, selectedMic, selectedSpeaker)
		if err != nil {
			gui.runOnUI(func() {
				gui.statusLabel.SetText(fmt.Sprintf("Error: %v", err))
				gui.connectBtn.Enable()
			})
			return
		}

		gui.runOnUI(func() {
			gui.statusLabel.SetText(fmt.Sprintf("Connected as %s", username))
			gui.connectBtn.SetText("Disconnect")
			gui.connectBtn.Enable()
		})
	}()
}

func (gui *GUI) onTestToneClicked() {
	if !gui.voiceClient.connected.Load() {
		gui.statusLabel.SetText("Connect first to send test tone")
		return
	}

	gui.testToneBtn.Disable()
	gui.statusLabel.SetText("Sending global test tone...")

	go func() {
		err := gui.voiceClient.SendBroadcastTestTone(1 * time.Second)
		if err != nil {
			gui.runOnUI(func() {
				gui.statusLabel.SetText(fmt.Sprintf("Test tone error: %v", err))
				gui.testToneBtn.Enable()
			})
		} else {
			gui.runOnUI(func() {
				gui.statusLabel.SetText("Global test tone sent")
				gui.testToneBtn.Enable()
			})
		}
	}()
}

func (gui *GUI) onPositionalTestClicked() {
	if !gui.voiceClient.connected.Load() {
		gui.statusLabel.SetText("Connect first to send test tone")
		return
	}

	gui.posTestBtn.Disable()
	gui.statusLabel.SetText("Sending positional test tone...")

	go func() {
		err := gui.voiceClient.SendTestTone(1 * time.Second)
		if err != nil {
			gui.runOnUI(func() {
				gui.statusLabel.SetText(fmt.Sprintf("Test tone error: %v", err))
				gui.posTestBtn.Enable()
			})
		} else {
			gui.runOnUI(func() {
				gui.statusLabel.SetText("Positional test tone sent")
				gui.posTestBtn.Enable()
			})
		}
	}()
}

func (gui *GUI) loadSavedConfig() {
	cfg, err := loadClientConfig()
	if err != nil {
		log.Printf("Failed to load config: %v", err)
		return
	}

	gui.savedConfig = &cfg
	if cfg.VADThreshold == 0 {
		cfg.VADThreshold = defaultVADThreshold
	}
	if !cfg.VADEnabled {
		cfg.VADEnabled = true
	}
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

func (gui *GUI) saveConfig(server string, port int, username string, micLabel string, speakerLabel string, vadEnabled bool, vadThreshold int) {
	cfg := ClientConfig{
		Server:       server,
		Port:         port,
		Username:     username,
		MicLabel:     micLabel,
		SpeakerLabel: speakerLabel,
		VADEnabled:   vadEnabled,
		VADThreshold: vadThreshold,
	}
	if err := saveClientConfig(cfg); err != nil {
		log.Printf("Failed to save config: %v", err)
	}
}

func (gui *GUI) applySavedSettings() {
	if gui.savedConfig == nil {
		return
	}

	if gui.savedConfig.MicLabel != "" {
		for _, option := range gui.micSelect.Options {
			if option == gui.savedConfig.MicLabel {
				gui.micSelect.SetSelected(gui.savedConfig.MicLabel)
				break
			}
		}
	}

	if gui.savedConfig.SpeakerLabel != "" {
		for _, option := range gui.speakerSelect.Options {
			if option == gui.savedConfig.SpeakerLabel {
				gui.speakerSelect.SetSelected(gui.savedConfig.SpeakerLabel)
				break
			}
		}
	}

	if gui.savedConfig.VADThreshold > 0 {
		gui.vadSlider.SetValue(float64(gui.savedConfig.VADThreshold))
	}
	if gui.savedConfig.VADEnabled {
		gui.vadCheck.SetChecked(true)
	}
	gui.voiceClient.SetVAD(gui.vadCheck.Checked, gui.currentVADThreshold())
	gui.updateVADIndicator(gui.vadCheck.Checked, false)
}

func (gui *GUI) parsePort() int {
	port, err := strconv.Atoi(gui.portInput.Text)
	if err != nil {
		return 0
	}
	return port
}

func (gui *GUI) currentVADThreshold() int {
	if gui.vadSlider == nil {
		return defaultVADThreshold
	}
	return int(gui.vadSlider.Value)
}

func (gui *GUI) updateVADIndicator(enabled bool, active bool) {
	if gui.vadBar == nil || gui.vadStateLabel == nil {
		return
	}

	switch {
	case !enabled:
		gui.vadBar.FillColor = color.NRGBA{R: 140, G: 140, B: 140, A: 255}
		gui.vadStateLabel.SetText("VAD: disabled")
	case active:
		gui.vadBar.FillColor = color.NRGBA{R: 76, G: 175, B: 80, A: 255}
		gui.vadStateLabel.SetText("VAD: speaking")
	default:
		gui.vadBar.FillColor = color.NRGBA{R: 220, G: 180, B: 80, A: 255}
		gui.vadStateLabel.SetText("VAD: idle")
	}
	gui.vadBar.Refresh()
	gui.vadStateLabel.Refresh()
}
