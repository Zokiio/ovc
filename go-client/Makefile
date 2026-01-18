APP_NAME ?= HytaleVoiceChat
CMD_DIR := ./cmd/voice-client
OUT_DIR ?= .

.PHONY: build build-gui build-nocgo clean

build:
	go build -o "$(OUT_DIR)/$(APP_NAME)" $(CMD_DIR)

build-gui:
	go build -ldflags="-H=windowsgui" -o "$(OUT_DIR)/$(APP_NAME).exe" $(CMD_DIR)

build-nocgo:
	CGO_ENABLED=0 go build -o "$(OUT_DIR)/$(APP_NAME)" $(CMD_DIR)

clean:
	rm -f "$(OUT_DIR)/$(APP_NAME)" "$(OUT_DIR)/$(APP_NAME).exe"
