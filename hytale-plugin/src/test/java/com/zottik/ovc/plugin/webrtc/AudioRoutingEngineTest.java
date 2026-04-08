package com.zottik.ovc.plugin.webrtc;

import com.zottik.ovc.common.model.Group;
import com.zottik.ovc.common.model.PlayerPosition;
import com.zottik.ovc.plugin.GroupManager;
import com.zottik.ovc.plugin.tracker.PlayerPositionTracker;
import io.netty.channel.embedded.EmbeddedChannel;
import org.junit.jupiter.api.Test;

import java.util.Collections;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class AudioRoutingEngineTest {
    @Test
    void isolatedSenderOnlyRoutesProximityToSameGroup() {
        UUID senderId = UUID.randomUUID();
        UUID sameGroupId = UUID.randomUUID();
        UUID outsiderId = UUID.randomUUID();

        GroupManager groupManager = new GroupManager();
        GroupStateManager groupStateManager = new GroupStateManager();
        PlayerPositionTracker tracker = new PlayerPositionTracker();

        Group group = groupManager.createGroup("isolated", true, senderId);
        assertNotNull(group);
        group.setIsolated(true);
        groupManager.joinGroup(senderId, group.getGroupId());
        groupManager.joinGroup(sameGroupId, group.getGroupId());

        WebRTCClient sender = new WebRTCClient(senderId, "sender", new EmbeddedChannel());
        WebRTCClient sameGroup = new WebRTCClient(sameGroupId, "member", new EmbeddedChannel());
        WebRTCClient outsider = new WebRTCClient(outsiderId, "outsider", new EmbeddedChannel());

        groupStateManager.addClientToGroup(senderId, sender, group.getGroupId());
        groupStateManager.addClientToGroup(sameGroupId, sameGroup, group.getGroupId());

        tracker.addPlayer(new PlayerPosition(senderId, "sender", 0, 0, 0, 0, 0, "world"));
        tracker.addPlayer(new PlayerPosition(sameGroupId, "member", 5, 0, 0, 0, 0, "world"));
        tracker.addPlayer(new PlayerPosition(outsiderId, "outsider", 5, 0, 0, 0, 0, "world"));

        AudioRoutingEngine engine = new AudioRoutingEngine(
            tracker,
            Map.of(senderId, sender, sameGroupId, sameGroup, outsiderId, outsider),
            groupStateManager,
            groupManager,
            50.0
        );

        var targets = engine.computeProximityTargets(
            senderId,
            tracker.getPlayerPosition(senderId),
            Collections.emptySet()
        );

        assertEquals(1, targets.size());
        assertEquals(sameGroupId, targets.get(0).recipientId());
    }
}
