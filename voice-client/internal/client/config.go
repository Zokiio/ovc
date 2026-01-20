package client

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type ClientConfig struct {
	Server       string `json:"server"`
	Port         int    `json:"port"`
	Username     string `json:"username"`
	MicLabel     string `json:"micLabel"`
	SpeakerLabel string `json:"speakerLabel"`
}

func loadClientConfig() (ClientConfig, error) {
	path, err := getConfigPath()
	if err != nil {
		return ClientConfig{}, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return ClientConfig{}, nil
		}
		return ClientConfig{}, fmt.Errorf("read config: %w", err)
	}

	var cfg ClientConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return ClientConfig{}, fmt.Errorf("parse config: %w", err)
	}

	return cfg, nil
}

func saveClientConfig(cfg ClientConfig) error {
	path, err := getConfigPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}

	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("write config: %w", err)
	}

	return nil
}

func getConfigPath() (string, error) {
	baseDir, err := getAppConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(baseDir, "client.json"), nil
}

func getAppConfigDir() (string, error) {
	baseDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("locate config dir: %w", err)
	}
	return filepath.Join(baseDir, "hytale-voicechat"), nil
}
