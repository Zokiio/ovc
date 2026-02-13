package com.zottik.ovc.plugin.webrtc;

import com.zottik.ovc.common.model.PlayerPosition;
import com.zottik.ovc.common.network.NetworkConfig;
import com.zottik.ovc.plugin.GroupManager;
import com.zottik.ovc.plugin.tracker.PlayerPositionTracker;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

final class AudioRoutingEngine {
    private final PlayerPositionTracker positionTracker;
    private final Map<UUID, WebRTCClient> clients;
    private final GroupStateManager groupStateManager;
    private final GroupManager groupManager;
    private final double proximityDistance;

    AudioRoutingEngine(
            PlayerPositionTracker positionTracker,
            Map<UUID, WebRTCClient> clients,
            GroupStateManager groupStateManager,
            GroupManager groupManager,
            double proximityDistance
    ) {
        this.positionTracker = positionTracker;
        this.clients = clients;
        this.groupStateManager = groupStateManager;
        this.groupManager = groupManager;
        this.proximityDistance = proximityDistance;
    }

    List<AudioRoutingTarget> computeGroupTargets(UUID groupId, UUID senderId, PlayerPosition senderPosition) {
        if (groupStateManager == null || groupManager == null) {
            return List.of();
        }

        var group = groupManager.getGroup(groupId);
        if (group == null) {
            return List.of();
        }

        double proximityRange = group.getSettings().getProximityRange();
        boolean isGlobalVoice = NetworkConfig.isGroupGlobalVoice();
        boolean isSpatialAudio = NetworkConfig.isGroupSpatialAudio();
        List<WebRTCClient> groupMembers = groupStateManager.getGroupClients(groupId);
        if (groupMembers.isEmpty()) {
            return List.of();
        }

        List<AudioRoutingTarget> targets = new ArrayList<>();
        for (WebRTCClient client : groupMembers) {
            if (client.getClientId().equals(senderId)) {
                continue;
            }

            PlayerPosition clientPosition = positionTracker.getPlayerPosition(client.getClientId());
            if (clientPosition == null) {
                continue;
            }

            double distance = senderPosition.distanceTo(clientPosition);
            if (distance == Double.MAX_VALUE) {
                continue;
            }

            if (isGlobalVoice) {
                if (isSpatialAudio) {
                    if (distance <= proximityRange) {
                        targets.add(new AudioRoutingTarget(client.getClientId(), distance, proximityRange, AudioRoutingMode.MIN_VOLUME));
                    } else {
                        targets.add(new AudioRoutingTarget(client.getClientId(), distance, proximityRange, AudioRoutingMode.FULL_VOLUME));
                    }
                } else {
                    targets.add(new AudioRoutingTarget(client.getClientId(), distance, proximityRange, AudioRoutingMode.FULL_VOLUME));
                }
            } else if (distance <= proximityRange) {
                targets.add(new AudioRoutingTarget(client.getClientId(), distance, proximityRange, AudioRoutingMode.NORMAL));
            }
        }

        return targets;
    }

    List<AudioRoutingTarget> computeProximityTargets(
            UUID senderId,
            PlayerPosition senderPosition,
            Set<UUID> excludedRecipientIds
    ) {
        Set<UUID> excluded = excludedRecipientIds != null ? excludedRecipientIds : Collections.emptySet();
        UUID senderGroupId = null;
        Boolean senderGroupIsolated = null;
        if (groupStateManager != null && groupManager != null) {
            senderGroupId = groupStateManager.getClientGroup(senderId);
            if (senderGroupId != null) {
                var senderGroup = groupManager.getGroup(senderGroupId);
                if (senderGroup != null) {
                    senderGroupIsolated = senderGroup.isIsolated();
                }
            }
        }

        List<AudioRoutingTarget> targets = new ArrayList<>();
        for (WebRTCClient client : clients.values()) {
            if (client.getClientId().equals(senderId)) {
                continue;
            }
            if (excluded.contains(client.getClientId())) {
                continue;
            }
            if (!isRecipientEligibleForProximity(senderGroupId, senderGroupIsolated, client.getClientId())) {
                continue;
            }

            PlayerPosition clientPosition = positionTracker.getPlayerPosition(client.getClientId());
            if (clientPosition == null) {
                continue;
            }

            double distance = senderPosition.distanceTo(clientPosition);
            if (distance <= proximityDistance && distance != Double.MAX_VALUE) {
                targets.add(new AudioRoutingTarget(client.getClientId(), distance, proximityDistance, AudioRoutingMode.NORMAL));
            }
        }

        return targets;
    }

    Set<UUID> buildGroupExclusionSet(UUID senderId, UUID groupId) {
        if (groupStateManager == null || groupId == null) {
            return Set.of(senderId);
        }

        Set<UUID> excluded = new HashSet<>();
        excluded.add(senderId);
        for (WebRTCClient groupMember : groupStateManager.getGroupClients(groupId)) {
            excluded.add(groupMember.getClientId());
        }
        return excluded;
    }

    private boolean isRecipientEligibleForProximity(
            UUID senderGroupId,
            Boolean senderGroupIsolated,
            UUID recipientId
    ) {
        if (groupStateManager == null || groupManager == null) {
            return true;
        }

        UUID recipientGroupId = groupStateManager.getClientGroup(recipientId);

        if (Boolean.TRUE.equals(senderGroupIsolated)) {
            return senderGroupId != null && senderGroupId.equals(recipientGroupId);
        }

        if (recipientGroupId == null) {
            return true;
        }

        var recipientGroup = groupManager.getGroup(recipientGroupId);
        if (recipientGroup != null && recipientGroup.isIsolated()) {
            return senderGroupId != null && senderGroupId.equals(recipientGroupId);
        }

        return true;
    }
}
