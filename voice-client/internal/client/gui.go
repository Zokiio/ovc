//go:build cgo
// +build cgo

package client

import (
	"fmt"
	"image/color"
	"log"
	"strconv"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/driver/desktop"
	"fyne.io/fyne/v2/widget"
)

// GUI represents the voice chat GUI
type GUI struct {
	myApp       fyne.App
	win         fyne.Window
	voiceClient *VoiceClient
	savedConfig *ClientConfig

	// UI Elements
	serverInput       *widget.Entry
	portInput         *widget.Entry
	usernameInput     *widget.Entry
	micSelect         *widget.Select
	speakerSelect     *widget.Select
	connectBtn        *widget.Button
	testToneBtn       *widget.Button
	posTestBtn        *widget.Button
	statusLabel       *widget.Label
	volumeSlider      *widget.Slider
	micGainSlider     *widget.Slider
	vadCheck          *widget.Check
	vadSlider         *widget.Slider
	vadHangoverSlider *widget.Slider
	vadBar            *canvas.Rectangle
	vadStateLabel     *widget.Label
	modeRadio         *widget.RadioGroup
	pttKeyEntry       *widget.Entry
	pttHoldBtn        *HoldButton
	pttToggleMode     *widget.Check
	uiReady           bool
}

// HoldButton triggers callbacks on mouse press/release for hold-to-talk behavior.
type HoldButton struct {
	widget.Button
	OnPressed  func()
	OnReleased func()
}

// MouseDown activates PTT when the button is pressed.
func (b *HoldButton) MouseDown(*desktop.MouseEvent) {
	if b.OnPressed != nil {
		b.OnPressed()
	}
}

// MouseUp deactivates PTT when the button is released.
func (b *HoldButton) MouseUp(*desktop.MouseEvent) {
	if b.OnReleased != nil {
		b.OnReleased()
	}
}

// NewHoldButton creates a hold-to-talk button with press/release callbacks.
func NewHoldButton(label string, onPressed, onReleased func()) *HoldButton {
	btn := &HoldButton{OnPressed: onPressed, OnReleased: onReleased}
	btn.Text = label
	btn.Importance = widget.HighImportance
	btn.ExtendBaseWidget(btn)
	return btn
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
	gui.serverInput.SetPlaceHolder("Server (e.g., URL or IP:port)")
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
		if !gui.uiReady {
			return
		}
		if gui.voiceClient.connected.Load() {
			if err := gui.voiceClient.SwitchAudioDevices(selected, gui.speakerSelect.Selected); err != nil {
				gui.statusLabel.SetText(fmt.Sprintf("Audio switch error: %v", err))
			} else {
				gui.statusLabel.SetText("Mic switched")
			}
		}
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	}
	gui.speakerSelect.OnChanged = func(selected string) {
		if !gui.uiReady {
			return
		}
		if gui.voiceClient.connected.Load() {
			if err := gui.voiceClient.SwitchAudioDevices(gui.micSelect.Selected, selected); err != nil {
				gui.statusLabel.SetText(fmt.Sprintf("Audio switch error: %v", err))
			} else {
				gui.statusLabel.SetText("Output switched")
			}
		}
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	}

	// VAD controls
	gui.modeRadio = widget.NewRadioGroup([]string{"Voice Activated", "Push-to-Talk"}, nil)
	gui.modeRadio.SetSelected("Voice Activated")

	gui.vadCheck = widget.NewCheck("Voice Activity Detection", func(on bool) {
		if !gui.uiReady {
			return
		}
		gui.voiceClient.SetVAD(on, gui.currentVADThreshold())
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, on, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	})
	gui.vadCheck.SetChecked(true)

	gui.vadSlider = widget.NewSlider(200, 6000)
	gui.vadSlider.Step = 50
	gui.vadSlider.SetValue(defaultVADThreshold)
	gui.vadSlider.OnChanged = func(value float64) {
		if !gui.uiReady {
			return
		}
		gui.voiceClient.SetVAD(gui.vadCheck.Checked, gui.currentVADThreshold())
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	}

	gui.vadHangoverSlider = widget.NewSlider(0, 200)
	gui.vadHangoverSlider.Step = 5
	gui.vadHangoverSlider.SetValue(30)
	gui.vadHangoverSlider.OnChanged = func(value float64) {
		if !gui.uiReady {
			return
		}
		gui.voiceClient.SetVADHangover(int(value))
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	}

	// Status label
	gui.statusLabel.Alignment = fyne.TextAlignCenter

	// Connect button
	gui.connectBtn = widget.NewButton("Connect", gui.onConnectClicked)

	// Test tone buttons
	gui.testToneBtn = widget.NewButton("Send Global Test Tone", gui.onTestToneClicked)
	gui.posTestBtn = widget.NewButton("Send Positional Test", gui.onPositionalTestClicked)

	// Volume sliders
	volumeLabel := widget.NewLabel("Output Volume:")
	gui.volumeSlider = widget.NewSlider(0, 200)
	gui.volumeSlider.SetValue(100)
	gui.volumeSlider.OnChanged = func(value float64) {
		if !gui.uiReady {
			return
		}
		gui.voiceClient.SetMasterVolume(value / 100.0)
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	}

	micLabel := widget.NewLabel("Mic Gain:")
	gui.micGainSlider = widget.NewSlider(0, 400)
	gui.micGainSlider.SetValue(100)
	gui.micGainSlider.OnChanged = func(value float64) {
		if !gui.uiReady {
			return
		}
		gui.voiceClient.SetMicGain(value / 100.0)
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)
	}

	gui.vadBar = canvas.NewRectangle(color.NRGBA{R: 180, G: 180, B: 180, A: 255})
	gui.vadBar.Resize(fyne.NewSize(120, 10))
	gui.vadStateLabel = widget.NewLabel("VAD: idle")
	gui.voiceClient.SetVADStateListener(func(enabled bool, active bool) {
		gui.runOnUI(func() {
			gui.updateVADIndicator(enabled, active)
		})
	})

	vadIndicatorRow := container.NewHBox(gui.vadBar, gui.vadStateLabel)
	vadBox := container.NewVBox(
		gui.vadCheck,
		container.NewBorder(nil, nil, widget.NewLabel("Threshold"), nil, gui.vadSlider),
		container.NewBorder(nil, nil, widget.NewLabel("Hangover (ms)"), nil, gui.vadHangoverSlider),
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

	volumeBox := container.NewVBox(
		container.NewBorder(nil, nil, volumeLabel, nil, gui.volumeSlider),
		container.NewBorder(nil, nil, micLabel, nil, gui.micGainSlider),
	)

	gui.pttKeyEntry = widget.NewEntry()
	gui.pttKeyEntry.SetPlaceHolder("PTT key (e.g., Space)")
	gui.pttKeyEntry.SetText("Space")
	gui.pttKeyEntry.OnChanged = func(s string) {
		if !gui.uiReady {
			return
		}
		gui.voiceClient.SetPushToTalk(gui.modeRadio.Selected == "Push-to-Talk", s)
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", s)
	}

	gui.modeRadio.OnChanged = func(option string) {
		if !gui.uiReady {
			return
		}
		isPTT := option == "Push-to-Talk"
		gui.voiceClient.SetPushToTalk(isPTT, gui.pttKeyEntry.Text)
		gui.vadCheck.SetChecked(!isPTT)
		gui.vadCheck.Disable()
		if !isPTT {
			gui.vadCheck.Enable()
			gui.voiceClient.SetVAD(gui.vadCheck.Checked, gui.currentVADThreshold())
		}
		gui.saveConfig(gui.serverInput.Text, gui.parsePort(), gui.usernameInput.Text, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, isPTT, gui.pttKeyEntry.Text)
	}

	gui.pttToggleMode = widget.NewCheck("Toggle mode (click to latch)", func(on bool) {
		if !gui.uiReady {
			return
		}
		state := "Toggle"
		if !on {
			state = "Hold"
		}
		gui.statusLabel.SetText("PTT button: " + state)
	})

	onPress := func() {
		if gui.pttToggleMode.Checked {
			active := !gui.voiceClient.pttActive.Load()
			gui.voiceClient.SetPTTActive(active)
			gui.statusLabel.SetText(toggleStatusText(active, "mouse"))
			return
		}
		gui.voiceClient.SetPTTActive(true)
		gui.statusLabel.SetText("PTT pressed (mouse)")
	}
	onRelease := func() {
		if gui.pttToggleMode.Checked {
			return
		}
		gui.voiceClient.SetPTTActive(false)
		gui.statusLabel.SetText("PTT released (mouse)")
	}
	gui.pttHoldBtn = NewHoldButton("Hold PTT (mouse)", onPress, onRelease)

	pttBox := container.NewVBox(
		widget.NewLabel("Mode"),
		gui.modeRadio,
		widget.NewLabel("PTT Key"),
		gui.pttKeyEntry,
		gui.pttHoldBtn,
		gui.pttToggleMode,
	)

	gui.applySavedSettings()
	gui.uiReady = true

	connectionBox := container.NewVBox(
		widget.NewLabel("Connection"),
		widget.NewSeparator(),
		form,
		gui.connectBtn,
		container.NewHBox(gui.testToneBtn, gui.posTestBtn),
		gui.statusLabel,
	)

	settingsBox := container.NewVBox(
		widget.NewLabel("Settings"),
		widget.NewSeparator(),
		volumeBox,
		vadBox,
		pttBox,
	)

	body := container.NewHBox(
		container.NewPadded(connectionBox),
		container.NewPadded(settingsBox),
	)

	content := container.NewVBox(
		title,
		widget.NewSeparator(),
		body,
	)

	gui.win.SetContent(content)

	// Register disconnect listener to update UI when server disconnects
	gui.voiceClient.SetDisconnectListener(func(reason string) {
		gui.runOnUI(func() {
			gui.statusLabel.SetText(fmt.Sprintf("Disconnected: %s", reason))
			gui.connectBtn.SetText("Connect")
			gui.connectBtn.Enable()
			gui.setConnectionEditable(true)
		})
	})

	// Key handlers for PTT (hold by default, toggle optional)
	if desk, ok := gui.win.Canvas().(desktop.Canvas); ok {
		desk.SetOnKeyDown(func(ev *fyne.KeyEvent) {
			gui.handlePTTKey(ev, true)
		})
		desk.SetOnKeyUp(func(ev *fyne.KeyEvent) {
			gui.handlePTTKey(ev, false)
		})
	} else {
		gui.win.Canvas().SetOnTypedKey(func(ev *fyne.KeyEvent) {
			gui.handlePTTKey(ev, true)
		})
	}
}

func (gui *GUI) onConnectClicked() {
	if gui.voiceClient.connected.Load() {
		gui.voiceClient.Disconnect()
		gui.connectBtn.SetText("Connect")
		gui.statusLabel.SetText("Disconnected")
		gui.setConnectionEditable(true)
		return
	}

	server := gui.serverInput.Text
	portStr := gui.portInput.Text
	username := gui.usernameInput.Text

	// Parse default port from port field
	defaultPort := 24454
	if portStr != "" {
		p, err := strconv.Atoi(portStr)
		if err != nil {
			gui.statusLabel.SetText("Invalid port number")
			return
		}
		defaultPort = p
	}

	// Parse server address (may contain embedded port)
	host, port, err := parseServerAddress(server, defaultPort)
	if err != nil {
		gui.statusLabel.SetText(fmt.Sprintf("Invalid server: %v", err))
		return
	}

	// Update port field if it was parsed from server string
	if strings.Contains(server, ":") {
		gui.portInput.SetText(strconv.Itoa(port))
	}

	gui.saveConfig(host, port, username, gui.micSelect.Selected, gui.speakerSelect.Selected, gui.vadCheck.Checked, gui.currentVADThreshold(), gui.volumeSlider.Value, gui.micGainSlider.Value, gui.modeRadio.Selected == "Push-to-Talk", gui.pttKeyEntry.Text)

	gui.statusLabel.SetText(fmt.Sprintf("Connecting to %s:%d...", host, port))
	gui.connectBtn.Disable()
	gui.setConnectionEditable(false)

	go func() {
		selectedMic := gui.micSelect.Selected
		selectedSpeaker := gui.speakerSelect.Selected
		err := gui.voiceClient.Connect(server, port, username, selectedMic, selectedSpeaker)
		if err != nil {
			gui.runOnUI(func() {
				gui.statusLabel.SetText(fmt.Sprintf("Error: %v", err))
				gui.connectBtn.Enable()
				gui.setConnectionEditable(true)
			})
			return
		}

		gui.runOnUI(func() {
			gui.statusLabel.SetText(fmt.Sprintf("Connected as %s", username))
			gui.connectBtn.SetText("Disconnect")
			gui.connectBtn.Enable()
			gui.setConnectionEditable(false)
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

func (gui *GUI) saveConfig(server string, port int, username string, micLabel string, speakerLabel string, vadEnabled bool, vadThreshold int, masterVol float64, micGain float64, ptt bool, pttKey string) {
	cfg := ClientConfig{
		Server:       server,
		Port:         port,
		Username:     username,
		MicLabel:     micLabel,
		SpeakerLabel: speakerLabel,
		VADEnabled:   vadEnabled,
		VADThreshold: vadThreshold,
		MasterVolume: masterVol,
		MicGain:      micGain,
		PushToTalk:   ptt,
		PTTKey:       pttKey,
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

	if gui.savedConfig.MasterVolume > 0 {
		gui.volumeSlider.SetValue(gui.savedConfig.MasterVolume)
		gui.voiceClient.SetMasterVolume(gui.savedConfig.MasterVolume / 100.0)
	} else {
		gui.volumeSlider.SetValue(100)
		gui.voiceClient.SetMasterVolume(1.0)
	}
	if gui.savedConfig.MicGain > 0 {
		gui.micGainSlider.SetValue(gui.savedConfig.MicGain)
		gui.voiceClient.SetMicGain(gui.savedConfig.MicGain / 100.0)
	} else {
		gui.micGainSlider.SetValue(100)
	}
	if gui.savedConfig.PushToTalk {
		gui.modeRadio.SetSelected("Push-to-Talk")
		gui.voiceClient.SetPushToTalk(true, gui.savedConfig.PTTKey)
		gui.vadCheck.Disable()
		if gui.savedConfig.PTTKey != "" {
			gui.pttKeyEntry.SetText(gui.savedConfig.PTTKey)
		}
	} else {
		gui.modeRadio.SetSelected("Voice Activated")
		gui.vadCheck.Enable()
	}
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

func toggleStatusText(active bool, source string) string {
	state := "released"
	if active {
		state = "pressed"
	}
	if source == "" {
		return "PTT " + state
	}
	return fmt.Sprintf("PTT %s (%s)", state, source)
}

func (gui *GUI) setConnectionEditable(enabled bool) {
	controls := []fyne.Disableable{gui.serverInput, gui.portInput, gui.usernameInput}
	for _, c := range controls {
		if c == nil {
			continue
		}
		if enabled {
			c.Enable()
		} else {
			c.Disable()
		}
	}
}

func (gui *GUI) handlePTTKey(ev *fyne.KeyEvent, down bool) {
	if gui.modeRadio.Selected != "Push-to-Talk" {
		return
	}
	if !strings.EqualFold(string(ev.Name), gui.pttKeyEntry.Text) {
		return
	}
	if gui.pttToggleMode.Checked {
		if down {
			active := !gui.voiceClient.pttActive.Load()
			gui.voiceClient.SetPTTActive(active)
			gui.statusLabel.SetText(toggleStatusText(active, "key"))
		}
		return
	}
	if down {
		gui.voiceClient.SetPTTActive(true)
		gui.statusLabel.SetText("PTT pressed (key)")
	} else {
		gui.voiceClient.SetPTTActive(false)
		gui.statusLabel.SetText("PTT released (key)")
	}
}
