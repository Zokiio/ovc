.PHONY: all build-client build-plugin clean help

# Default target
all: build-client build-plugin

# Build the Go client
build-client:
	@echo "Building Go client..."
	cd go-client && $(MAKE) build

# Build the Hytale plugin
build-plugin:
	@echo "Building Hytale plugin..."
	cd hytale-plugin && ./gradlew build

# Clean build artifacts
clean:
	@echo "Cleaning Go client..."
	cd go-client && $(MAKE) clean
	@echo "Cleaning Hytale plugin..."
	cd hytale-plugin && ./gradlew clean

# Show help
help:
	@echo "Hytale Voice Chat - Build Commands"
	@echo ""
	@echo "  make all           - Build both client and plugin (default)"
	@echo "  make build-client  - Build only the Go client"
	@echo "  make build-plugin  - Build only the Hytale plugin"
	@echo "  make clean         - Clean all build artifacts"
	@echo "  make help          - Show this help message"
