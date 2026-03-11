package com.zottik.ovc.plugin.webrtc;

import java.util.UUID;

record AudioRoutingTarget(UUID recipientId, double distance, double maxRange, AudioRoutingMode mode) {
}
