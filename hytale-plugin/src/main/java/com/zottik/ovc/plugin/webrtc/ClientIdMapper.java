package com.zottik.ovc.plugin.webrtc;

import java.security.SecureRandom;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Maps real UUIDs to obfuscated session-local IDs.
 * Used to hide actual player UUIDs from web clients.
 * IDs are session-local and reset when the server restarts.
 */
public class ClientIdMapper {
    private static final String HEX_CHARS = "0123456789abcdef";
    private static final String PREFIX = "p_";
    private static final int ID_LENGTH = 4; // 4 hex chars = 65536 possible IDs
    private static final SecureRandom random = new SecureRandom();
    
    private final Map<UUID, String> uuidToObfuscated = new ConcurrentHashMap<>();
    private final Map<String, UUID> obfuscatedToUuid = new ConcurrentHashMap<>();
    
    /**
     * Get or create an obfuscated ID for a UUID.
     * If the UUID already has a mapping, returns the existing obfuscated ID.
     * 
     * @param uuid The real UUID
     * @return The obfuscated ID (e.g., "p_a7f3")
     */
    public String getObfuscatedId(UUID uuid) {
        return uuidToObfuscated.computeIfAbsent(uuid, k -> {
            String obfuscated = generateUniqueId();
            obfuscatedToUuid.put(obfuscated, uuid);
            return obfuscated;
        });
    }
    
    /**
     * Resolve an obfuscated ID back to a UUID.
     * 
     * @param obfuscatedId The obfuscated ID
     * @return The original UUID, or null if not found
     */
    public UUID resolveUuid(String obfuscatedId) {
        return obfuscatedToUuid.get(obfuscatedId);
    }
    
    /**
     * Check if a UUID has a mapping
     */
    public boolean hasMapping(UUID uuid) {
        return uuidToObfuscated.containsKey(uuid);
    }
    
    /**
     * Remove a mapping when a client disconnects
     */
    public void removeMapping(UUID uuid) {
        String obfuscated = uuidToObfuscated.remove(uuid);
        if (obfuscated != null) {
            obfuscatedToUuid.remove(obfuscated);
        }
    }
    
    /**
     * Clear all mappings (e.g., on server shutdown)
     */
    public void clear() {
        uuidToObfuscated.clear();
        obfuscatedToUuid.clear();
    }
    
    /**
     * Generate a unique 4-char hex ID with prefix
     */
    private String generateUniqueId() {
        String id;
        int attempts = 0;
        do {
            id = PREFIX + generateRandomHex();
            attempts++;
            // Prevent infinite loop in case of ID exhaustion (very unlikely)
            if (attempts > 1000) {
                throw new RuntimeException("Failed to generate unique obfuscated ID");
            }
        } while (obfuscatedToUuid.containsKey(id));
        return id;
    }
    
    /**
     * Generate a random 4-character hex string
     */
    private String generateRandomHex() {
        StringBuilder sb = new StringBuilder(ID_LENGTH);
        for (int i = 0; i < ID_LENGTH; i++) {
            sb.append(HEX_CHARS.charAt(random.nextInt(HEX_CHARS.length())));
        }
        return sb.toString();
    }
    
    /**
     * Get the number of active mappings
     */
    public int size() {
        return uuidToObfuscated.size();
    }
}
