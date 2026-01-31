package com.hytale.voicechat.plugin.tracker;

import com.hypixel.hytale.logger.HytaleLogger;

import java.io.*;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Map;
import java.util.Properties;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Store for auth codes with file persistence.
 * Used for quick validation during web client authentication.
 * Codes are generated and stored when players use /vc login.
 */
public class AuthCodeStore {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final String AUTH_FILE = "voice-chat-auth.properties";
    private static final String CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excludes confusing chars like 0/O, 1/I
    private static final int CODE_LENGTH = 6;
    private static final SecureRandom random = new SecureRandom();
    
    // Map username (lowercase) -> auth code
    private final Map<String, String> authCodes = new ConcurrentHashMap<>();
    // Map username (lowercase) -> player UUID
    private final Map<String, UUID> playerUUIDs = new ConcurrentHashMap<>();
    
    private final Path dataDir;
    
    public AuthCodeStore(Path dataDir) {
        this.dataDir = dataDir;
        loadFromFile();
    }
    
    /**
     * Generate a new random auth code
     */
    public static String generateCode() {
        StringBuilder code = new StringBuilder(CODE_LENGTH);
        for (int i = 0; i < CODE_LENGTH; i++) {
            code.append(CHARS.charAt(random.nextInt(CHARS.length())));
        }
        return code.toString();
    }
    
    /**
     * Get existing code or generate a new one for a player
     * @param username The player's username
     * @param playerId The player's UUID
     * @return The auth code (existing or newly generated)
     */
    public String getOrCreateCode(String username, UUID playerId) {
        String key = username.toLowerCase();
        String existingCode = authCodes.get(key);
        if (existingCode != null) {
            return existingCode;
        }
        String newCode = generateCode();
        storeCode(username, playerId, newCode);
        return newCode;
    }
    
    /**
     * Force generate a new code, replacing any existing one
     */
    public String resetCode(String username, UUID playerId) {
        String newCode = generateCode();
        storeCode(username, playerId, newCode);
        return newCode;
    }
    
    /**
     * Store an auth code for a player
     * @param username The player's username
     * @param playerId The player's UUID
     * @param authCode The auth code
     */
    public void storeCode(String username, UUID playerId, String authCode) {
        String key = username.toLowerCase();
        authCodes.put(key, authCode);
        playerUUIDs.put(key, playerId);
        saveToFile();
    }
    
    /**
     * Validate an auth code for a player
     * @param username The player's username
     * @param providedCode The code to validate
     * @return true if the code is valid
     */
    public boolean validateCode(String username, String providedCode) {
        if (username == null || providedCode == null) {
            return false;
        }
        String storedCode = authCodes.get(username.toLowerCase());
        if (storedCode == null) {
            return false;
        }
        return storedCode.equalsIgnoreCase(providedCode);
    }
    
    /**
     * Check if a player has an auth code stored
     */
    public boolean hasCode(String username) {
        return authCodes.containsKey(username.toLowerCase());
    }
    
    /**
     * Get the player UUID for a username
     */
    public UUID getPlayerUUID(String username) {
        return playerUUIDs.get(username.toLowerCase());
    }
    
    /**
     * Remove a player's auth code
     */
    public void removeCode(String username) {
        String key = username.toLowerCase();
        authCodes.remove(key);
        playerUUIDs.remove(key);
        saveToFile();
    }
    
    /**
     * Clear all codes
     */
    public void clear() {
        authCodes.clear();
        playerUUIDs.clear();
        saveToFile();
    }
    
    private void loadFromFile() {
        Path filePath = dataDir.resolve(AUTH_FILE);
        if (!Files.exists(filePath)) {
            return;
        }
        
        try (InputStream is = Files.newInputStream(filePath)) {
            Properties props = new Properties();
            props.load(is);
            
            for (String key : props.stringPropertyNames()) {
                if (key.endsWith(".code")) {
                    String username = key.substring(0, key.length() - 5);
                    String code = props.getProperty(key);
                    String uuidStr = props.getProperty(username + ".uuid");
                    
                    authCodes.put(username, code);
                    if (uuidStr != null) {
                        try {
                            playerUUIDs.put(username, UUID.fromString(uuidStr));
                        } catch (IllegalArgumentException e) {
                            logger.atWarning().log("Invalid UUID for " + username);
                        }
                    }
                }
            }
            logger.atInfo().log("Loaded " + authCodes.size() + " auth codes from file");
        } catch (IOException e) {
            logger.atWarning().log("Failed to load auth codes: " + e.getMessage());
        }
    }
    
    private void saveToFile() {
        try {
            Files.createDirectories(dataDir);
            Path filePath = dataDir.resolve(AUTH_FILE);
            
            Properties props = new Properties();
            for (Map.Entry<String, String> entry : authCodes.entrySet()) {
                String username = entry.getKey();
                props.setProperty(username + ".code", entry.getValue());
                UUID uuid = playerUUIDs.get(username);
                if (uuid != null) {
                    props.setProperty(username + ".uuid", uuid.toString());
                }
            }
            
            try (OutputStream os = Files.newOutputStream(filePath)) {
                props.store(os, "Voice Chat Auth Codes - Do not edit manually");
            }
        } catch (IOException e) {
            logger.atWarning().log("Failed to save auth codes: " + e.getMessage());
        }
    }
}
