//go:build !cgo
// +build !cgo

package client

import (
	"fmt"
	"time"
)

const DefaultDeviceLabel = "Default (system)"

// SimpleAudioManager is a stub for non-CGO builds.
type SimpleAudioManager struct {
	inputChan  chan []int16
	outputChan chan []int16
	frameSize  int
	sampleRate int
}

func NewSimpleAudioManager() (*SimpleAudioManager, error) {
	return &SimpleAudioManager{
		inputChan:  make(chan []int16, 1),
		outputChan: make(chan []int16, 1),
		frameSize:  960,
		sampleRate: 48000,
	}, nil
}

func (am *SimpleAudioManager) Start() error {
	return fmt.Errorf("audio requires a CGO-enabled build")
}

func (am *SimpleAudioManager) Stop() error {
	return nil
}

func (am *SimpleAudioManager) EncodeAudio(_ []int16) ([]byte, error) {
	return []byte{}, nil
}

func (am *SimpleAudioManager) DecodeAudio(_ []byte) ([]int16, error) {
	return make([]int16, am.frameSize), nil
}

func (am *SimpleAudioManager) GetInputChannel() <-chan []int16 {
	return am.inputChan
}

func (am *SimpleAudioManager) GetOutputChannel() chan<- []int16 {
	return am.outputChan
}

func (am *SimpleAudioManager) SetInputDeviceLabel(_ string) {}

func (am *SimpleAudioManager) SetOutputDeviceLabel(_ string) {}

func (am *SimpleAudioManager) SendTestTone(_ time.Duration, _ float64) error {
	return fmt.Errorf("audio requires a CGO-enabled build")
}

func ListInputDevices() ([]string, error) {
	return []string{DefaultDeviceLabel}, nil
}

func ListOutputDevices() ([]string, error) {
	return []string{DefaultDeviceLabel}, nil
}
