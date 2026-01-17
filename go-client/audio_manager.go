package main

import (
	"encoding/binary"
	"log"
	"time"
)

type SimpleAudioManager struct {
	inputChan  chan []int16
	outputChan chan []int16
	done       chan bool
	frameSize  int
	sampleRate int
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
	log.Println("Audio manager initialized (PCM audio codec ready)")
	return nil
}

func (am *SimpleAudioManager) Stop() error {
	close(am.done)
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
