APP_NAME ?= HytaleVoiceChat
CMD_DIR := ./cmd/voice-client
OUT_DIR ?= dist
MSYS2_BIN ?= C:/msys64/mingw64/bin

.PHONY: build build-gui build-nocgo clean copy-dlls build-all

build: copy-dlls
	go build -o "$(OUT_DIR)/$(APP_NAME)" $(CMD_DIR)

build-gui: copy-dlls
	go build -ldflags="-H=windowsgui" -o "$(OUT_DIR)/$(APP_NAME).exe" $(CMD_DIR)

build-all: build-gui

build-nocgo:
	CGO_ENABLED=0 go build -o "$(OUT_DIR)/$(APP_NAME)" $(CMD_DIR)

copy-dlls:
	@mkdir -p "$(OUT_DIR)"
	@if [ -f "$(MSYS2_BIN)/libportaudio.dll" ]; then \
		cp "$(MSYS2_BIN)/libportaudio.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		cp "$(MSYS2_BIN)/libopus-0.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		cp "$(MSYS2_BIN)/libopusfile-0.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		cp "$(MSYS2_BIN)/libogg-0.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		cp "$(MSYS2_BIN)/libgcc_s_seh-1.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		cp "$(MSYS2_BIN)/libstdc++-6.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		cp "$(MSYS2_BIN)/libwinpthread-1.dll" "$(OUT_DIR)/" 2>/dev/null || true; \
		echo "DLLs copied to $(OUT_DIR)/"; \
	fi

clean:
	rm -rf "$(OUT_DIR)"
