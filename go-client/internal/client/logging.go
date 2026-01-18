package client

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
)

func InitLogging() (func(), error) {
	baseDir, err := getAppConfigDir()
	if err != nil {
		return nil, err
	}

	logDir := filepath.Join(baseDir, "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, fmt.Errorf("create log dir: %w", err)
	}

	logPath := filepath.Join(logDir, "client.log")
	file, err := os.OpenFile(logPath, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open log file: %w", err)
	}

	log.SetFlags(log.LstdFlags | log.Lmicroseconds)
	log.SetOutput(io.MultiWriter(file, os.Stderr))
	log.Printf("Logging to %s", logPath)

	return func() {
		if err := file.Close(); err != nil {
			log.Printf("Failed to close log file: %v", err)
		}
	}, nil
}
