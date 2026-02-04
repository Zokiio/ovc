package com.hytale.voicechat.common.config;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.HashMap;
import java.util.Map;

/**
 * Configuration loader for Hytale Voice Chat
 * Loads from: ovc.conf -> system properties -> defaults
 * Uses HOCON-style format for key-value configuration
 */
public class VoiceConfig {
    private static Map<String, String> config = new HashMap<>();
    private static boolean initialized = false;
    
    // Default config file location (can be overridden with -Dvoice.config.file)
    private static final String DEFAULT_CONFIG_PATH = "ovc.conf";
    
    static {
        initialize();
    }
    
    private static void initialize() {
        if (initialized) {
            return;
        }
        initialized = true;
        
        // Determine config file path
        String configFilePath = System.getProperty("voice.config.file", DEFAULT_CONFIG_PATH);
        Path configPath = Paths.get(configFilePath);
        
        System.out.println("[VoiceConfig] Loading configuration from: " + configPath.toAbsolutePath());
        
        // Load from file if exists
        if (Files.exists(configPath)) {
            try {
                loadConfigFile(configPath);
                System.out.println("[VoiceConfig] Loaded configuration from file: " + configPath);
            } catch (IOException e) {
                System.err.println("[VoiceConfig] Failed to read configuration file: " + configPath + " - " + e.getMessage());
                System.err.println("[VoiceConfig] Using system properties and defaults");
            } catch (Exception e) {
                System.err.println("[VoiceConfig] Failed to parse configuration file: " + configPath + " - " + e.getMessage());
                System.err.println("[VoiceConfig] Using system properties and defaults");
            }
        } else {
            System.out.println("[VoiceConfig] Configuration file not found: " + configPath + ", using system properties and defaults");
        }
    }
    
    /**
     * Load and parse HOCON-style configuration file
     * Supports: Key = Value format with # comments
     */
    private static void loadConfigFile(Path configPath) throws IOException {
        for (String line : Files.readAllLines(configPath, StandardCharsets.UTF_8)) {
            line = line.trim();
            
            // Skip empty lines and comments
            if (line.isEmpty() || line.startsWith("#")) {
                continue;
            }
            
            // Parse key = value
            int equalsIndex = line.indexOf('=');
            if (equalsIndex > 0) {
                String key = line.substring(0, equalsIndex).trim();
                String value = line.substring(equalsIndex + 1).trim();
                
                // Remove surrounding quotes if present
                if (value.startsWith("\"") && value.endsWith("\"")) {
                    value = value.substring(1, value.length() - 1);
                }
                
                config.put(key, value);
            }
        }
    }
    
    /**
     * Get string property with fallback: file -> system property -> default
     */
    public static String getString(String key, String defaultValue) {
        // Check file config first
        if (config.containsKey(key)) {
            return config.get(key);
        }
        
        // Fall back to system property
        String value = System.getProperty(key);
        if (value != null) {
            return value;
        }
        
        // Fall back to default
        return defaultValue;
    }
    
    /**
     * Get boolean property with fallback: file -> system property -> default
     */
    public static boolean getBoolean(String key, boolean defaultValue) {
        // Check file config first
        if (config.containsKey(key)) {
            String value = config.get(key);
            return "true".equalsIgnoreCase(value) || "yes".equalsIgnoreCase(value) || "1".equals(value);
        }
        
        // Fall back to system property
        String value = System.getProperty(key);
        if (value != null) {
            return Boolean.parseBoolean(value.toLowerCase());
        }
        
        // Fall back to default
        return defaultValue;
    }
    
    /**
     * Get integer property with fallback: file -> system property -> default
     */
    public static int getInt(String key, int defaultValue) {
        // Check file config first
        if (config.containsKey(key)) {
            try {
                return Integer.parseInt(config.get(key));
            } catch (NumberFormatException e) {
                System.err.println("[VoiceConfig] Invalid integer value for " + key + ", using default: " + defaultValue);
            }
        }
        
        // Fall back to system property
        String value = System.getProperty(key);
        if (value != null) {
            try {
                return Integer.parseInt(value);
            } catch (NumberFormatException e) {
                System.err.println("[VoiceConfig] Invalid integer value for " + key + ": " + value + ", using default: " + defaultValue);
            }
        }
        
        // Fall back to default
        return defaultValue;
    }
    
    /**
     * Get double property with fallback: file -> system property -> default
     */
    public static double getDouble(String key, double defaultValue) {
        // Check file config first
        if (config.containsKey(key)) {
            try {
                return Double.parseDouble(config.get(key));
            } catch (NumberFormatException e) {
                System.err.println("[VoiceConfig] Invalid double value for " + key + ", using default: " + defaultValue);
            }
        }
        
        // Fall back to system property
        String value = System.getProperty(key);
        if (value != null) {
            try {
                return Double.parseDouble(value);
            } catch (NumberFormatException e) {
                System.err.println("[VoiceConfig] Invalid double value for " + key + ": " + value + ", using default: " + defaultValue);
            }
        }
        
        // Fall back to default
        return defaultValue;
    }
    
    /**
     * Reload configuration (useful for testing)
     */
    public static void reload() {
        config.clear();
        initialized = false;
        initialize();
    }
}
