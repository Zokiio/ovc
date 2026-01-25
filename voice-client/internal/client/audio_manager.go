//go:build cgo
// +build cgo

package client

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
	"gopkg.in/hraban/opus.v2"
)

const DefaultDeviceLabel = "Default (system)"
const (
	AudioCodecPCM  byte = 0x00
	AudioCodecOpus byte = 0x01
)

type SimpleAudioManager struct {
	inputChan    chan []int16
	outputChan   chan []int16
	done         chan bool
	frameSize    int
	sampleRate   int
	inputFrameSize  int
	outputFrameSize int
	inputSampleRate int
	outputSampleRate int
	mu           sync.Mutex
	encodeMu     sync.Mutex
	decodeMu     sync.Mutex
	micGain      float64
	outputGain   float64
	inputStream  *portaudio.Stream
	outputStream *portaudio.Stream
	inputLabel   string
	outputLabel  string
	useOpus      bool
	encoder      *opus.Encoder
	decoder      *opus.Decoder
}

func NewSimpleAudioManager(sampleRate int) (*SimpleAudioManager, error) {
	sampleRate = sanitizeSampleRate(sampleRate)
	frameSize := frameSizeForSampleRate(sampleRate)

	am := &SimpleAudioManager{
		inputChan:  make(chan []int16, 16),
		outputChan: make(chan []int16, 16),
		frameSize:  frameSize,
		sampleRate: sampleRate,
		inputFrameSize:  frameSize,
		outputFrameSize: frameSize,
		inputSampleRate: sampleRate,
		outputSampleRate: sampleRate,
		done:       make(chan bool),
		useOpus:    true,
		micGain:    1.0,
		outputGain: 1.0,
	}
	return am, nil
}

func (am *SimpleAudioManager) SetMicGain(gain float64) {
	am.mu.Lock()
	defer am.mu.Unlock()
	if gain < 0.0 {
		gain = 0.0
	}
	if gain > 4.0 {
		gain = 4.0
	}
	am.micGain = gain
}

func (am *SimpleAudioManager) SetOutputGain(gain float64) {
	am.mu.Lock()
	defer am.mu.Unlock()
	if gain < 0.0 {
		gain = 0.0
	}
	if gain > 4.0 {
		gain = 4.0
	}
	am.outputGain = gain
}

func (am *SimpleAudioManager) Start() error {
	am.mu.Lock()
	defer am.mu.Unlock()

	if err := portaudio.Initialize(); err != nil {
		return fmt.Errorf("failed to initialize PortAudio: %w", err)
	}

	inputStream, inputLabel, inputDevice, err := am.openInputStream()
	if err != nil {
		portaudio.Terminate()
		return err
	}

	outputStream, err := am.openOutputStream(inputDevice)
	if err != nil {
		inputStream.Close()
		portaudio.Terminate()
		return err
	}

	am.inputStream = inputStream
	am.outputStream = outputStream
	am.inputLabel = inputLabel

	if am.useOpus {
		if err := am.initOpus(); err != nil {
			log.Printf("Opus init failed, falling back to PCM: %v", err)
			am.useOpus = false
		}
	}

	// Start input stream with retry logic
	var inputStartErr error
	for i := 0; i < 3; i++ {
		inputStartErr = am.inputStream.Start()
		if inputStartErr == nil {
			break
		}
		log.Printf("Failed to start input stream (attempt %d/3): %v", i+1, inputStartErr)
		if i < 2 {
			time.Sleep(time.Millisecond * 100)
		}
	}
	if inputStartErr != nil {
		am.inputStream.Close()
		am.inputStream = nil
		am.outputStream.Stop()
		am.outputStream.Close()
		am.outputStream = nil
		portaudio.Terminate()
		return fmt.Errorf("failed to start audio stream after 3 attempts: %w (try closing other audio applications or restarting)", inputStartErr)
	}

	codec := "PCM"
	if am.useOpus && am.encoder != nil && am.decoder != nil {
		codec = "Opus"
	}
	log.Printf("Audio manager initialized (%s codec ready, input: %s, network=%dHz, input=%dHz, output=%dHz)", codec, am.inputLabel, am.sampleRate, am.inputSampleRate, am.outputSampleRate)
	return nil
}

func (am *SimpleAudioManager) initOpus() error {
	enc, err := opus.NewEncoder(am.sampleRate, 1, opus.AppVoIP)
	if err != nil {
		return err
	}
	dec, err := opus.NewDecoder(am.sampleRate, 1)
	if err != nil {
		return err
	}
	am.encoder = enc
	am.decoder = dec
	log.Printf("Opus codec ready (frame=%d, sampleRate=%d)", am.frameSize, am.sampleRate)
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

	if am.inputStream != nil {
		am.inputStream.Stop()
		am.inputStream.Close()
		am.inputStream = nil
	}

	if am.outputStream != nil {
		am.outputStream.Stop()
		am.outputStream.Close()
		am.outputStream = nil
	}

	portaudio.Terminate()
	time.Sleep(50 * time.Millisecond)
	return nil
}

func (am *SimpleAudioManager) EncodeAudio(codec byte, samples []int16) ([]byte, error) {
	if len(samples) == 0 {
		return []byte{}, nil
	}

	samples = fitSamples(samples, am.inputFrameSize)
	if am.inputSampleRate != am.sampleRate {
		samples = resampleLinear(samples, am.inputSampleRate, am.sampleRate, am.frameSize)
	}
	samples = fitSamples(samples, am.frameSize)

	gain := am.micGain
	if gain != 1.0 {
		scaled := make([]int16, len(samples))
		for i, s := range samples {
			v := float64(s) * gain
			if v > math.MaxInt16 {
				v = math.MaxInt16
			} else if v < math.MinInt16 {
				v = math.MinInt16
			}
			scaled[i] = int16(v)
		}
		samples = scaled
	}

	switch codec {
	case AudioCodecOpus:
		if !am.useOpus || am.encoder == nil {
			return nil, fmt.Errorf("opus encoder not available")
		}
		am.encodeMu.Lock()
		// 4 KB buffer is plenty for mono voice frames
		buf := make([]byte, 4000)
		n, err := am.encoder.Encode(samples, buf)
		am.encodeMu.Unlock()
		if err != nil {
			return nil, err
		}
		return buf[:n], nil
	case AudioCodecPCM:
		return encodePCM(samples), nil
	default:
		return nil, fmt.Errorf("unknown codec: %d", codec)
	}
}

func (am *SimpleAudioManager) DecodeAudio(codec byte, data []byte) ([]int16, error) {
	if len(data) == 0 {
		return make([]int16, am.outputFrameSize), nil
	}

	switch codec {
	case AudioCodecOpus:
		if !am.useOpus || am.decoder == nil {
			return nil, fmt.Errorf("opus decoder not available")
		}
		am.decodeMu.Lock()
		pcm := make([]int16, am.frameSize)
		n, err := am.decoder.Decode(data, pcm)
		am.decodeMu.Unlock()
		if err != nil {
			return nil, err
		}
		if n < len(pcm) {
			padded := make([]int16, am.frameSize)
			copy(padded, pcm[:n])
			pcm = padded
		} else {
			pcm = pcm[:n]
		}
		
		// Resample from network rate to output device rate if needed
		if am.outputSampleRate != am.sampleRate {
			pcm = resampleLinear(pcm, am.sampleRate, am.outputSampleRate, am.outputFrameSize)
		}
		pcm = fitSamples(pcm, am.outputFrameSize)
		
		return pcm, nil
	case AudioCodecPCM:
		pcm := decodePCM(data, am.frameSize)
		
		// Resample from network rate to output device rate if needed
		if am.outputSampleRate != am.sampleRate {
			pcm = resampleLinear(pcm, am.sampleRate, am.outputSampleRate, am.outputFrameSize)
		}
		pcm = fitSamples(pcm, am.outputFrameSize)
		
		return pcm, nil
	default:
		return nil, fmt.Errorf("unknown codec: %d", codec)
	}
}

func encodePCM(samples []int16) []byte {
	encoded := make([]byte, len(samples)*2)
	for i, sample := range samples {
		binary.LittleEndian.PutUint16(encoded[i*2:], uint16(sample))
	}
	return encoded
}

func decodePCM(data []byte, frameSize int) []int16 {
	if len(data) == 0 {
		return make([]int16, frameSize)
	}

	samples := make([]int16, len(data)/2)
	for i := 0; i < len(samples); i++ {
		if i*2+1 < len(data) {
			samples[i] = int16(binary.LittleEndian.Uint16(data[i*2:]))
		}
	}

	if len(samples) < frameSize {
		padded := make([]int16, frameSize)
		copy(padded, samples)
		samples = padded
	}

	return samples
}

func fitSamples(samples []int16, frameSize int) []int16 {
	if frameSize <= 0 {
		return []int16{}
	}
	if len(samples) < frameSize {
		padded := make([]int16, frameSize)
		copy(padded, samples)
		return padded
	}
	if len(samples) > frameSize {
		return samples[:frameSize]
	}
	return samples
}

// resampleLinear performs basic linear interpolation for audio resampling.
// Note: This implementation uses simple linear interpolation, which can introduce
// aliasing artifacts and reduce audio quality, especially when downsampling.
// For production use with higher quality requirements, consider using a more
// sophisticated resampling algorithm (such as cubic interpolation or sinc resampling)
// or leveraging the Opus codec's built-in resampling capabilities.
func resampleLinear(input []int16, inRate int, outRate int, outLen int) []int16 {
	if outLen <= 0 {
		return []int16{}
	}
	if len(input) == 0 {
		return make([]int16, outLen)
	}
	if inRate == outRate {
		return fitSamples(input, outLen)
	}
	if outLen == 1 {
		return []int16{input[0]}
	}

	result := make([]int16, outLen)
	maxIndex := len(input) - 1
	step := float64(maxIndex) / float64(outLen-1)
	for i := 0; i < outLen; i++ {
		pos := float64(i) * step
		idx := int(pos)
		frac := pos - float64(idx)
		if idx >= maxIndex {
			result[i] = input[maxIndex]
			continue
		}
		v0 := float64(input[idx])
		v1 := float64(input[idx+1])
		v := v0 + (v1-v0)*frac
		if v > math.MaxInt16 {
			v = math.MaxInt16
		} else if v < math.MinInt16 {
			v = math.MinInt16
		}
		result[i] = int16(v)
	}
	return result
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

func (am *SimpleAudioManager) SetOutputDeviceLabel(label string) {
	am.outputLabel = label
}

func (am *SimpleAudioManager) SendTestTone(duration time.Duration, frequency float64) error {
	if duration <= 0 {
		return fmt.Errorf("invalid duration")
	}
	if frequency <= 0 {
		return fmt.Errorf("invalid frequency")
	}

	frameDuration := time.Duration(float64(time.Second) * float64(am.inputFrameSize) / float64(am.inputSampleRate))
	totalFrames := int(duration / frameDuration)
	if totalFrames < 1 {
		totalFrames = 1
	}

	phase := 0.0
	phaseInc := 2 * math.Pi * frequency / float64(am.inputSampleRate)
	amplitude := 0.2 * float64(math.MaxInt16)

	for i := 0; i < totalFrames; i++ {
		samples := make([]int16, am.inputFrameSize)
		for j := 0; j < am.inputFrameSize; j++ {
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

func ListOutputDevices() ([]string, error) {
	if err := portaudio.Initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize PortAudio: %w", err)
	}
	defer portaudio.Terminate()

	options, err := buildOutputDeviceOptions()
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

func (am *SimpleAudioManager) openInputStream() (*portaudio.Stream, string, *portaudio.DeviceInfo, error) {
	inputDevice, inputLabel, err := resolveInputDevice(am.inputLabel)
	if err != nil {
		return nil, "", nil, err
	}

	if inputDevice == nil {
		return nil, "", nil, fmt.Errorf("no input device available")
	}

	inputRate := am.sampleRate
	if inputDevice.DefaultSampleRate > 0 {
		inputRate = int(math.Round(inputDevice.DefaultSampleRate))
	}
	if inputRate <= 0 {
		inputRate = am.sampleRate
	}
	am.inputSampleRate = inputRate
	am.inputFrameSize = frameSizeForSampleRate(inputRate)

	// Try low latency first
	params := portaudio.StreamParameters{
		Input: portaudio.StreamDeviceParameters{
			Device:   inputDevice,
			Channels: 1,
			Latency:  inputDevice.DefaultLowInputLatency,
		},
		SampleRate:      float64(inputRate),
		FramesPerBuffer: am.inputFrameSize,
	}

	stream, err := portaudio.OpenStream(params, am.processInput)
	if err != nil {
		// Fallback to high latency if low latency fails
		log.Printf("Low latency input failed, trying high latency: %v", err)
		params.Input.Latency = inputDevice.DefaultHighInputLatency
		stream, err = portaudio.OpenStream(params, am.processInput)
		if err != nil {
			return nil, "", nil, fmt.Errorf("failed to open audio stream (tried low and high latency): %w", err)
		}
	}

	return stream, inputLabel, inputDevice, nil
}

func (am *SimpleAudioManager) openOutputStream(inputDevice *portaudio.DeviceInfo) (*portaudio.Stream, error) {
	outputDevice, err := resolveOutputDeviceByLabel(am.outputLabel, inputDevice)
	if err != nil {
		return nil, err
	}
	if outputDevice == nil {
		return nil, fmt.Errorf("no output device available")
	}

	outputRate := am.sampleRate
	if outputDevice.DefaultSampleRate > 0 {
		outputRate = int(math.Round(outputDevice.DefaultSampleRate))
	}
	if outputRate <= 0 {
		if am.inputSampleRate > 0 {
			outputRate = am.inputSampleRate
		} else {
			outputRate = am.sampleRate
		}
	}
	am.outputSampleRate = outputRate
	am.outputFrameSize = frameSizeForSampleRate(outputRate)

	// Try multiple configurations in order of preference
	configs := []struct {
		channels int
		latency  time.Duration
		desc     string
	}{
		{2, outputDevice.DefaultLowOutputLatency, "stereo low latency"},
		{2, outputDevice.DefaultHighOutputLatency, "stereo high latency"},
		{1, outputDevice.DefaultLowOutputLatency, "mono low latency"},
		{1, outputDevice.DefaultHighOutputLatency, "mono high latency"},
	}

	// First try with the selected device
	for _, cfg := range configs {
		stream, err := am.tryOpenOutputStream(outputDevice, outputRate, cfg.channels, cfg.latency, cfg.desc)
		if err == nil {
			return stream, nil
		}
	}

	// If all configs failed with selected device, try other devices (DirectSound, MME on Windows)
	if runtime.GOOS == "windows" {
		log.Printf("All configs failed with primary device, trying alternative devices...")
		devices, err := portaudio.Devices()
		if err == nil {
			for _, altDevice := range devices {
				if altDevice.MaxOutputChannels == 0 || altDevice == outputDevice {
					continue
				}
				// Try DirectSound or MME devices
				hostName := hostNameFromDevice(altDevice)
				if !strings.Contains(hostName, "DirectSound") && !strings.Contains(hostName, "MME") {
					continue
				}
				
				for _, cfg := range configs {
					stream, err := am.tryOpenOutputStream(altDevice, outputRate, cfg.channels, cfg.latency, fmt.Sprintf("%s (%s)", cfg.desc, hostName))
					if err == nil {
						return stream, nil
					}
				}
			}
		}
	}

	return nil, fmt.Errorf("failed to open audio stream after trying all configurations and devices")
}

func (am *SimpleAudioManager) tryOpenOutputStream(outputDevice *portaudio.DeviceInfo, outputRate int, channels int, latency time.Duration, desc string) (*portaudio.Stream, error) {
	params := portaudio.StreamParameters{
		Output: portaudio.StreamDeviceParameters{
			Device:   outputDevice,
			Channels: channels,
			Latency:  latency,
		},
		SampleRate:      float64(outputRate),
		FramesPerBuffer: am.outputFrameSize,
	}

	stream, err := portaudio.OpenStream(params, am.processOutput)
	if err != nil {
		log.Printf("Failed to open output with %s: %v", desc, err)
		return nil, err
	}

	// Try to start the stream to verify it actually works
	err = stream.Start()
	if err != nil {
		log.Printf("Failed to start output with %s: %v", desc, err)
		stream.Close()
		return nil, err
	}

	// Success! Leave it running, caller will use it
	if channels == 1 {
		log.Printf("Warning: Using mono output (stereo not supported)")
	}
	log.Printf("Successfully initialized output stream with %s", desc)
	return stream, nil
}

var outputPacketCount int

func (am *SimpleAudioManager) processInput(in []int16) {
	if len(in) > 0 {
		samples := make([]int16, len(in))
		copy(samples, in)
		select {
		case am.inputChan <- samples:
		default:
		}
	}
}

func (am *SimpleAudioManager) processOutput(out []int16) {
	select {
	case samples := <-am.outputChan:
		outputPacketCount++
		if outputPacketCount%100 == 1 {
			log.Printf("Playing audio packet #%d, samples=%d", outputPacketCount, len(samples))
		}
		gain := am.outputGain
		if gain != 1.0 {
			for i := range samples {
				v := float64(samples[i]) * gain
				if v > math.MaxInt16 {
					v = math.MaxInt16
				} else if v < math.MinInt16 {
					v = math.MinInt16
				}
				samples[i] = int16(v)
			}
		}
		switch {
		case len(samples) == len(out):
			copy(out, samples)
		case len(samples)*2 == len(out):
			// Expand mono to stereo if needed
			for i := 0; i < len(samples); i++ {
				v := samples[i]
				out[2*i] = v
				out[2*i+1] = v
			}
		default:
			copy(out, samples)
			if len(samples) < len(out) {
				for i := len(samples); i < len(out); i++ {
					out[i] = 0
				}
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

func resolveOutputDeviceByLabel(label string, inputDevice *portaudio.DeviceInfo) (*portaudio.DeviceInfo, error) {
	if label == "" || label == DefaultDeviceLabel {
		return resolveOutputDevice(inputDevice)
	}

	options, err := buildOutputDeviceOptions()
	if err != nil {
		return nil, err
	}

	for _, option := range options {
		if option.label == label {
			return option.device, nil
		}
	}

	return resolveOutputDevice(inputDevice)
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

func buildOutputDeviceOptions() ([]deviceOption, error) {
	devices, err := portaudio.Devices()
	if err != nil {
		return nil, fmt.Errorf("failed to list devices: %w", err)
	}

	candidates := make([]*portaudio.DeviceInfo, 0, len(devices))
	for _, device := range devices {
		if device.MaxOutputChannels > 0 {
			candidates = append(candidates, device)
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
