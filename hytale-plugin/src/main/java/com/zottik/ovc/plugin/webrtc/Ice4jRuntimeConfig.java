package com.zottik.ovc.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import com.typesafe.config.ConfigFactory;

import java.util.concurrent.atomic.AtomicBoolean;

final class Ice4jRuntimeConfig {
    private static final AtomicBoolean INITIALIZED = new AtomicBoolean(false);

    private Ice4jRuntimeConfig() {
    }

    static void initialize(HytaleLogger logger) {
        if (!INITIALIZED.compareAndSet(false, true)) {
            return;
        }

        try {
            ConfigFactory.invalidateCaches();
            Thread currentThread = Thread.currentThread();
            ClassLoader originalClassLoader = currentThread.getContextClassLoader();
            currentThread.setContextClassLoader(WebRTCPeerManager.class.getClassLoader());
            ConfigFactory.load(WebRTCPeerManager.class.getClassLoader());
            currentThread.setContextClassLoader(originalClassLoader);
            logger.atInfo().log("Loaded Typesafe Config with ice4j settings from reference.conf");
        } catch (Exception e) {
            logger.atWarning().log("Failed to load Typesafe Config: " + e.getMessage());
        }

        try {
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_INTERVAL", "30000");
            System.setProperty("ice4j.consent-freshness.interval", "30000");

            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_ORIGINAL_INTERVAL", "5000");
            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_WAIT_INTERVAL", "5000");
            System.setProperty("ice4j.consent-freshness.original-wait-interval", "5000");

            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_MAX_WAIT_INTERVAL", "10000");
            System.setProperty("ice4j.consent-freshness.max-wait-interval", "10000");

            System.setProperty("org.ice4j.ice.CONSENT_FRESHNESS_MAX_RETRANSMISSIONS", "3");
            System.setProperty("ice4j.consent-freshness.max-retransmissions", "3");

            System.setProperty("ice4j.consent-freshness.randomize-interval", "true");

            System.setProperty("org.ice4j.TERMINATION_DELAY", "3000");
            System.setProperty("ice4j.ice.termination-delay", "3000");

            System.setProperty("org.ice4j.MAX_CHECK_LIST_SIZE", "100");
            System.setProperty("ice4j.ice.max-check-list-size", "100");

            System.setProperty("org.ice4j.ice.USE_COMPONENT_SOCKET", "true");
            System.setProperty("ice4j.use-component-socket", "true");

            System.setProperty("org.ice4j.REDACT_REMOTE_ADDRESSES", "false");
            System.setProperty("ice4j.redact-remote-addresses", "false");

            System.setProperty("org.ice4j.SOFTWARE", "ice4j.org");
            System.setProperty("ice4j.software", "ice4j.org");

            System.setProperty("ice4j.send-to-last-received-from-address", "false");

            System.setProperty("org.ice4j.ice.harvest.DISABLE_LINK_LOCAL_ADDRESSES", "false");
            System.setProperty("ice4j.harvest.use-link-local-addresses", "true");

            System.setProperty("org.ice4j.ipv6.DISABLED", "false");
            System.setProperty("ice4j.harvest.use-ipv6", "true");

            System.setProperty("org.ice4j.ice.harvest.HARVESTING_TIMEOUT", "15000");
            System.setProperty("ice4j.harvest.timeout", "15000");

            System.setProperty("org.ice4j.ice.harvest.USE_DYNAMIC_HOST_HARVESTER", "true");
            System.setProperty("ice4j.harvest.udp.use-dynamic-ports", "true");

            System.setProperty("org.ice4j.ice.harvest.AbstractUdpListener.SO_RCVBUF", "0");
            System.setProperty("ice4j.harvest.udp.receive-buffer-size", "0");

            System.setProperty("ice4j.harvest.udp.socket-pool-size", "0");

            System.setProperty("org.ice4j.ice.harvest.ALLOWED_INTERFACES", "");
            System.setProperty("ice4j.harvest.allowed-interfaces", "");

            System.setProperty("org.ice4j.ice.harvest.BLOCKED_INTERFACES", "");
            System.setProperty("ice4j.harvest.blocked-interfaces", "");

            System.setProperty("org.ice4j.ice.harvest.ALLOWED_ADDRESSES", "");
            System.setProperty("ice4j.harvest.allowed-addresses", "");

            System.setProperty("org.ice4j.ice.harvest.BLOCKED_ADDRESSES", "");
            System.setProperty("ice4j.harvest.blocked-addresses", "");

            System.setProperty("org.ice4j.ice.harvest.DISABLE_AWS_HARVESTER", "true");
            System.setProperty("ice4j.harvest.mapping.aws.enabled", "false");

            System.setProperty("org.ice4j.ice.harvest.FORCE_AWS_HARVESTER", "false");
            System.setProperty("ice4j.harvest.mapping.aws.force", "false");

            System.setProperty("ice4j.harvest.stun.enabled", "true");
            System.setProperty("ice4j.harvest.upnp.enabled", "false");

            logger.atInfo().log("Ice4j system properties configured");
        } catch (Exception e) {
            logger.atWarning().log("Failed to configure Ice4j properties: " + e.getMessage());
        }

        try {
            java.util.logging.Logger.getLogger("org.ice4j").setLevel(java.util.logging.Level.WARNING);
            java.util.logging.Logger.getLogger("org.jitsi").setLevel(java.util.logging.Level.WARNING);
            java.util.logging.Logger.getLogger("org.jitsi.config").setLevel(java.util.logging.Level.WARNING);
            java.util.logging.Logger.getLogger("org.jitsi.utils").setLevel(java.util.logging.Level.WARNING);
            java.util.logging.Logger.getLogger("org.jitsi.dcsctp4j").setLevel(java.util.logging.Level.WARNING);

            java.util.logging.Logger iceAgentLogger = java.util.logging.Logger.getLogger("org.ice4j.ice.Agent");
            iceAgentLogger.setFilter(record -> {
                String message = record.getMessage();
                return message == null || !message.contains("ICE state changed from Completed to Terminated");
            });

            java.util.logging.Logger.getLogger("org.ice4j.ice.harvest.HostCandidateHarvester")
                .setLevel(java.util.logging.Level.WARNING);
            java.util.logging.Logger.getLogger("org.ice4j.stack.NetAccessManager")
                .setLevel(java.util.logging.Level.WARNING);

            java.util.logging.Logger componentSocketLogger =
                java.util.logging.Logger.getLogger("org.ice4j.ice.ComponentSocket");
            componentSocketLogger.setLevel(java.util.logging.Level.WARNING);
            componentSocketLogger.setFilter(record -> {
                String message = record.getMessage();
                return message == null || !message.contains("Active socket already initialized");
            });
        } catch (Exception e) {
            logger.atWarning().log("Failed to install ICE log filter: " + e.getMessage());
        }
    }
}
