package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/gordonklaus/portaudio"
)

const DefaultDeviceLabel = "Default (system)"

type SimpleAudioManager struct {
	inputChan  chan []int16
	outputChan chan []int16
	done       chan bool
	frameSize  int
	sampleRate int
	mu         sync.Mutex
	stream     *portaudio.Stream
	inputLabel string
}

func NewSimpleAudioManager() (*SimpleAudioManager, error) {
	frameSize := 960
	sampleRate := 48000

	am := &SimpleAudioManager{
		inputChan:  make(chan []int16, 16),
		outputChan: make(chan []int16, 16),
		frameSize:  frameSize,
		sampleRate: sampleRate,
		done:       make(chan bool),
	}

	return am, nil
}

func (am *SimpleAudioManager) Start() error {
	am.mu.Lock()
	defer am.mu.Unlock()

	if err := portaudio.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize PortAudio: %w", err)
	}

	stream, inputLabel, err := am.openStream()
	if err != nil {
		portaudio.Terminate()
		return err
	}

	am.stream = stream
	am.inputLabel = inputLabel

	if err := am.stream.Start(); err != nil {
		am.stream.Close()
		am.stream = nil
		portaudio.Terminate()
		return fmt.Errorf("failed to start audio stream: %w", err)
	}

	log.Printf("Audio manager initialized (PCM audio codec ready, input: %s)", am.inputLabel)
	return nil
}

func (am *SimpleAudioManager) Stop() error {
	am.mu.Lock()
	defer am.mu.Unlock()

	select {
	case <-am.done:
	default:
		close(am.done)
	}

	if am.stream != nil {
		am.stream.Stop()
		am.stream.Close()
		am.stream = nil
	}

	portaudio.Terminate()
	time.Sleep(50 * time.Millisecond)
	return nil
}

func (am *SimpleAudioManager) EncodeAudio(samples []int16) ([]byte, error) {
	if len(samples) == 0 {
		return []byte{}, nil
	}

	if len(samples) < am.frameSize {
		padded := make([]int16, am.frameSize)
		copy(padded, samples)
		samples = padded
	} else if len(samples) > am.frameSize {
		samples = samples[:am.frameSize]
	}

	encoded := make([]byte, len(samples)*2)
	for i, sample := range samples {
		binary.LittleEndian.PutUint16(encoded[i*2:], uint16(sample))
	}

	return encoded, nil
}

func (am *SimpleAudioManager) DecodeAudio(data []byte) ([]int16, error) {
	if len(data) == 0 {
		return make([]int16, am.frameSize), nil
	}

	samples := make([]int16, len(data)/2)
	for i := 0; i < len(samples); i++ {
		if i*2+1 < len(data) {
			samples[i] = int16(binary.LittleEndian.Uint16(data[i*2:]))
		}
	}

	if len(samples) < am.frameSize {
		padded := make([]int16, am.frameSize)
		copy(padded, samples)
		samples = padded
	}

	return samples, nil
}

func (am *SimpleAudioManager) GetInputChannel() <-chan []int16 {
	return am.inputChan
}

func (am *SimpleAudioManager) GetOutputChannel() chan<- []int16 {
	return am.outputChan
}

func (am *SimpleAudioManager) SetInputDeviceLabel(label string) {
	am.inputLabel = label
}

func (am *SimpleAudioManager) SendTestTone(duration time.Duration, frequency float64) error {
	if duration <= 0 {
		return fmt.Errorf("invalid duration")
	}
	if frequency <= 0 {
		return fmt.Errorf("invalid frequency")
	}

	frameDuration := time.Duration(float64(time.Second) * float64(am.frameSize) / float64(am.sampleRate))
	totalFrames := int(duration / frameDuration)
	if totalFrames < 1 {
		totalFrames = 1
	}

	phase := 0.0
	phaseInc := 2 * math.Pi * frequency / float64(am.sampleRate)
	amplitude := 0.2 * float64(math.MaxInt16)

	for i := 0; i < totalFrames; i++ {
		samples := make([]int16, am.frameSize)
		for j := 0; j < am.frameSize; j++ {
			samples[j] = int16(math.Sin(phase) * amplitude)
			phase += phaseInc
			if phase >= 2*math.Pi {
				phase -= 2 * math.Pi
			}
		}

		select {
		case am.inputChan <- samples:
		default:
		}

		time.Sleep(frameDuration)
	}

	return nil
}

func ListInputDevices() ([]string, error) {
	if err := portaudio.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize PortAudio: %w", err)
	}
	defer portaudio.Terminate()

	options, err := buildInputDeviceOptions()
	if err != nil {
		return nil, err
	}

	labels := []string{DefaultDeviceLabel}
	for _, option := range options {
		labels = append(labels, option.label)
	}
	return labels, nil
}

type deviceOption struct {
	label  string
	device *portaudio.DeviceInfo
}

func (am *SimpleAudioManager) openStream() (*portaudio.Stream, string, error) {
	inputDevice, inputLabel, err := resolveInputDevice(am.inputLabel)
	if err != nil {
		return nil, "", err
	}

	if inputDevice == nil {
		return nil, "", fmt.Errorf("no input device available")
	}

	outputDevice, err := resolveOutputDevice(inputDevice)
	if err != nil {
		return nil, "", err
	}
	if outputDevice == nil {
		return nil, "", fmt.Errorf("no output device available")
	}

	params := portaudio.StreamParameters{
		Input: portaudio.StreamDeviceParameters{
			Device:   inputDevice,
			Channels: 1,
			Latency:  inputDevice.DefaultLowInputLatency,
		},
		Output: portaudio.StreamDeviceParameters{
			Device:   outputDevice,
			Channels: 1,
			Latency:  inputDevice.DefaultLowInputLatency,
		},
		SampleRate:      float64(am.sampleRate),
		FramesPerBuffer: am.frameSize,
	}

	params.Output.Latency = params.Output.Device.DefaultLowOutputLatency

	if err := portaudio.IsFormatSupported(params, am.processAudio); err != nil {
		return nil, "", fmt.Errorf("audio format not supported: %w", err)
	}

	stream, err := portaudio.OpenStream(params, am.processAudio)
	if err != nil {
		return nil, "", fmt.Errorf("failed to open audio stream: %w", err)
	}

	return stream, inputLabel, nil
}

func (am *SimpleAudioManager) processAudio(in, out []int16) {
	if len(in) > 0 {
		samples := make([]int16, len(in))
		copy(samples, in)
		select {
		case am.inputChan <- samples:
		default:
		}
	}

	select {
	case samples := <-am.outputChan:
		copy(out, samples)
		if len(samples) < len(out) {
			for i := len(samples); i < len(out); i++ {
				out[i] = 0
			}
		}
	default:
		for i := range out {
			out[i] = 0
		}
	}
}

func resolveInputDevice(label string) (*portaudio.DeviceInfo, string, error) {
	if label == "" || label == DefaultDeviceLabel {
		device, err := portaudio.DefaultInputDevice()
		if err != nil {
			return nil, "", fmt.Errorf("failed to get default input device: %w", err)
		}
		if device == nil {
			return nil, "", nil
		}
		return device, DefaultDeviceLabel, nil
	}

	options, err := buildInputDeviceOptions()
	if err != nil {
		return nil, "", err
	}

	for _, option := range options {
		if option.label == label {
			return option.device, label, nil
		}
	}

	return nil, "", fmt.Errorf("input device not found: %s", label)
}

func resolveOutputDevice(inputDevice *portaudio.DeviceInfo) (*portaudio.DeviceInfo, error) {
	if inputDevice == nil || inputDevice.HostApi == nil {
		device, err := portaudio.DefaultOutputDevice()
		if err != nil {
			return nil, fmt.Errorf("failed to get default output device: %w", err)
		}
		return device, nil
	}

	devices, err := portaudio.Devices()
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}

	for _, device := range devices {
		if device.MaxOutputChannels == 0 {
			continue
		}
		if device.HostApi != nil && device.HostApi == inputDevice.HostApi {
			return device, nil
		}
	}

	device, err := portaudio.DefaultOutputDevice()
	if err != nil {
		return nil, fmt.Errorf("failed to get default output device: %w", err)
	}
	return device, nil
}

func buildInputDeviceOptions() ([]deviceOption, error) {
	devices, err := portaudio.Devices()
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}

	candidates := make([]*portaudio.DeviceInfo, 0, len(devices))
	for _, device := range devices {
		if device.MaxInputChannels > 0 {
			candidates = append(candidates, device)
		}
	}

	if runtime.GOOS == "windows" {
		wasapi := filterByHostAPI(candidates, "WASAPI")
		if len(wasapi) > 0 {
			candidates = wasapi
		}
	}

	nameCounts := make(map[string]int)
	for _, device := range candidates {
		nameCounts[device.Name]++
	}

	usedLabels := make(map[string]int)
	options := make([]deviceOption, 0, len(candidates))
	for _, device := range candidates {
		label := device.Name
		if nameCounts[device.Name] > 1 {
			host := hostName(device)
			if host != "" {
				label = fmt.Sprintf("%s (%s)", device.Name, host)
			}
		}
		if count := usedLabels[label]; count > 0 {
			label = fmt.Sprintf("%s #%d", label, count+1)
		}
		usedLabels[label]++
		options = append(options, deviceOption{
			label:  label,
			device: device,
		})
	}

	return options, nil
}

func filterByHostAPI(devices []*portaudio.DeviceInfo, hostName string) []*portaudio.DeviceInfo {
	hostName = strings.ToLower(hostName)
	filtered := make([]*portaudio.DeviceInfo, 0, len(devices))
	for _, device := range devices {
		if strings.Contains(strings.ToLower(hostNameFromDevice(device)), hostName) {
			filtered = append(filtered, device)
		}
	}
	return filtered
}

func hostNameFromDevice(device *portaudio.DeviceInfo) string {
	if device == nil || device.HostApi == nil {
		return ""
	}
	return device.HostApi.Name
}

func hostName(device *portaudio.DeviceInfo) string {
	return hostNameFromDevice(device)
}
