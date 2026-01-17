package main

import (
	"fmt"
	"image/color"
	"strconv"

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

	// UI Elements
	serverInput   *widget.Entry
	portInput     *widget.Entry
	usernameInput *widget.Entry
	connectBtn    *widget.Button
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
	gui.portInput.SetText("25566")

	// Username input
	gui.usernameInput = widget.NewEntry()
	gui.usernameInput.SetPlaceHolder("Username")
	gui.usernameInput.SetText("Player")

	// Status label
	gui.statusLabel = widget.NewLabel("Disconnected")
	gui.statusLabel.Alignment = fyne.TextAlignCenter

	// Connect button
	gui.connectBtn = widget.NewButton("Connect", gui.onConnectClicked)

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
	)

	volumeBox := container.NewBorder(nil, nil, volumeLabel, nil, gui.volumeSlider)

	content := container.NewVBox(
		title,
		widget.NewSeparator(),
		form,
		widget.NewSeparator(),
		gui.connectBtn,
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

	gui.statusLabel.SetText("Connecting...")
	gui.connectBtn.Disable()

	go func() {
		err := gui.voiceClient.Connect(server, port, username)
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
