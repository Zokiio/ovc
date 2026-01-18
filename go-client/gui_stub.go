//go:build !cgo
// +build !cgo

package main

import "log"

// GUI is a stub for non-CGO builds.
type GUI struct{}

func NewGUI(_ *VoiceClient) *GUI {
	return &GUI{}
}

func (gui *GUI) Run() {
	log.Fatal("GUI requires a CGO-enabled build. Set CGO_ENABLED=1 and rebuild.")
}
