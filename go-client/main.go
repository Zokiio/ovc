package main

func main() {
	client := NewVoiceClient()
	gui := NewGUI(client)
	gui.Run()
}
