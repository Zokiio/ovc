package main

import (
	"log"

	"hytale-voice-chat-go/internal/client"
)

func main() {
	cleanup, err := client.InitLogging()
	if err != nil {
		log.Printf("Logging setup failed: %v", err)
	} else {
		defer cleanup()
	}

	voiceClient := client.NewVoiceClient()
	gui := client.NewGUI(voiceClient)
	gui.Run()
}
