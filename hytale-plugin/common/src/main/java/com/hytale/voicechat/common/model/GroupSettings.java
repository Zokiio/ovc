package com.hytale.voicechat.common.model;

/**
 * Immutable settings model for voice groups
 * Configured by group creator and broadcasted to all members
 */
public class GroupSettings {
    private final int defaultVolume; // 0-200%
    private final double proximityRange; // blocks/meters
    private final boolean allowInvites;
    private final int maxMembers;

    // Default values
    public static final int DEFAULT_VOLUME = 100;
    public static final double DEFAULT_PROXIMITY_RANGE = com.hytale.voicechat.common.network.NetworkConfig.DEFAULT_PROXIMITY_DISTANCE;
    public static final boolean DEFAULT_ALLOW_INVITES = true;
    public static final int DEFAULT_MAX_MEMBERS = 50;

    // Validation bounds
    public static final int MIN_VOLUME = 0;
    public static final int MAX_VOLUME = 200;
    public static final int MIN_MAX_MEMBERS = 2;

    public GroupSettings() {
        this(DEFAULT_VOLUME, DEFAULT_PROXIMITY_RANGE, DEFAULT_ALLOW_INVITES, DEFAULT_MAX_MEMBERS);
    }

    /**
     * Create group settings with validation.
     * Invalid values are clamped to valid ranges as a defensive measure:
     * - defaultVolume: clamped to [MIN_VOLUME, MAX_VOLUME] (0-200)
     * - proximityRange: reset to DEFAULT_PROXIMITY_RANGE if <= 0
     * - maxMembers: clamped to minimum of MIN_MAX_MEMBERS (2)
     */
    public GroupSettings(int defaultVolume, double proximityRange, boolean allowInvites, int maxMembers) {
        this.defaultVolume = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, defaultVolume));
        this.proximityRange = proximityRange > 0 ? proximityRange : DEFAULT_PROXIMITY_RANGE;
        this.allowInvites = allowInvites;
        this.maxMembers = Math.max(MIN_MAX_MEMBERS, maxMembers);
    }

    public int getDefaultVolume() {
        return defaultVolume;
    }

    public double getProximityRange() {
        return proximityRange;
    }

    public boolean isAllowInvites() {
        return allowInvites;
    }

    public int getMaxMembers() {
        return maxMembers;
    }

    /**
     * Check if group is at capacity
     */
    public boolean isAtCapacity(int currentMemberCount) {
        return currentMemberCount >= maxMembers;
    }

    /**
     * Builder pattern for easy construction
     */
    public static class Builder {
        private int defaultVolume = DEFAULT_VOLUME;
        private double proximityRange = DEFAULT_PROXIMITY_RANGE;
        private boolean allowInvites = DEFAULT_ALLOW_INVITES;
        private int maxMembers = DEFAULT_MAX_MEMBERS;

        public Builder defaultVolume(int volume) {
            this.defaultVolume = volume;
            return this;
        }

        public Builder proximityRange(double range) {
            this.proximityRange = range;
            return this;
        }

        public Builder allowInvites(boolean allow) {
            this.allowInvites = allow;
            return this;
        }

        public Builder maxMembers(int max) {
            this.maxMembers = max;
            return this;
        }

        public GroupSettings build() {
            return new GroupSettings(defaultVolume, proximityRange, allowInvites, maxMembers);
        }
    }

    @Override
    public String toString() {
        return "GroupSettings{" +
                "defaultVolume=" + defaultVolume +
                ", proximityRange=" + proximityRange +
                ", allowInvites=" + allowInvites +
                ", maxMembers=" + maxMembers +
                '}';
    }
}
