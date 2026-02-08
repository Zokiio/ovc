package com.hytale.voicechat.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.jitsi.dcsctp4j.DcSctp4j;
import org.jitsi.dcsctp4j.DcSctpMessage;
import org.jitsi.dcsctp4j.DcSctpOptions;
import org.jitsi.dcsctp4j.DcSctpSocketCallbacks;
import org.jitsi.dcsctp4j.DcSctpSocketFactory;
import org.jitsi.dcsctp4j.DcSctpSocketInterface;
import org.jitsi.dcsctp4j.ErrorKind;
import org.jitsi.dcsctp4j.PacketObserver;
import org.jitsi.dcsctp4j.SendPacketStatus;
import org.jitsi.dcsctp4j.SendStatus;
import org.jitsi.dcsctp4j.SendOptions;
import org.jitsi.dcsctp4j.SocketState;
import org.jitsi.dcsctp4j.Timeout;

import java.io.IOException;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * SCTP transport layer backed by jitsi-dcsctp.
 * Bridges SCTP packets over DTLS transport.
 */
public class SctpTransport {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();
    private static final long RESOURCE_EXHAUSTION_LOG_INTERVAL_MS = 5000L;

    private final String clientId;
    private final DtlsTransport dtlsTransport;
    private final ScheduledExecutorService executor;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicLong lastResourceExhaustionLogAt = new AtomicLong(0);
    private final AtomicLong suppressedResourceExhaustionLogs = new AtomicLong(0);

    private DcSctpSocketInterface socket;
    private Thread receiveThread;
    private SctpTransportListener listener;

    public SctpTransport(String clientId, DtlsTransport dtlsTransport) {
        this.clientId = clientId;
        this.dtlsTransport = dtlsTransport;
        this.executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "sctp-timeouts-" + clientId);
            t.setDaemon(true);
            return t;
        });
    }

    public void setListener(SctpTransportListener listener) {
        this.listener = listener;
    }

    public void start(int localPort, int remotePort) {
        if (running.getAndSet(true)) {
            return;
        }

        // Initialize native SCTP library
        new DcSctp4j();

        DcSctpOptions options = new DcSctpOptions();
        options.setLocalPort(localPort);
        options.setRemotePort(remotePort);
        options.setMaxMessageSize(1_073_741_823L); // 1GB
        options.setAnnouncedMaximumIncomingStreams(1024);
        options.setAnnouncedMaximumOutgoingStreams(1024);
        // Keep SCTP packets safely under the DTLS/UDP 1200-byte send limit
        // to avoid drops on common WAN/relay paths.
        options.setMtu(1000);

        DcSctpSocketCallbacks callbacks = new DcsctpCallbacks();
        PacketObserver packetObserver = null;

        DcSctpSocketFactory factory = new DcSctpSocketFactory();
        socket = factory.create("webrtc-" + clientId, callbacks, packetObserver, options);
        socket.connect();

        startReceiveLoop();

        logger.atInfo().log("SCTP transport started for client " + clientId);
    }

    private void startReceiveLoop() {
        receiveThread = new Thread(() -> {
            byte[] buffer = new byte[2048];
            while (running.get()) {
                try {
                    int received = dtlsTransport.receive(buffer, 0, buffer.length, 100);
                    if (received > 0) {
                        socket.receivePacket(buffer, 0, received);
                    }
                } catch (IOException e) {
                    if (running.get()) {
                        logger.atWarning().log("DTLS receive error for client " + clientId + ": " + e.getMessage());
                        if (listener != null) {
                            listener.onError(e);
                        }
                    }
                } catch (Exception e) {
                    if (running.get()) {
                        logger.atWarning().log("SCTP receive loop error for client " + clientId + ": " + e.getMessage());
                        if (listener != null) {
                            listener.onError(e);
                        }
                    }
                }
            }
        }, "sctp-recv-" + clientId);
        receiveThread.setDaemon(true);
        receiveThread.start();
    }

    public SendStatus send(short streamId, int ppid, byte[] payload) {
        return send(streamId, ppid, payload, new SendOptions());
    }

    public SendStatus send(short streamId, int ppid, byte[] payload, SendOptions options) {
        if (socket == null || socket.state() != SocketState.kConnected) {
            return SendStatus.kErrorShuttingDown;
        }

        byte[] data = payload == null ? new byte[0] : payload;
        DcSctpMessage message = new DcSctpMessage(streamId, ppid, data);
        SendOptions sendOptions = options != null ? options : new SendOptions();
        return socket.send(message, sendOptions);
    }

    public void close() {
        running.set(false);
        if (socket != null) {
            socket.shutdown();
            socket.close();
        }
        executor.shutdownNow();
        logger.atInfo().log("SCTP transport closed for client " + clientId);
    }

    private class DcsctpCallbacks implements DcSctpSocketCallbacks {
        @Override
        public SendPacketStatus sendPacketWithStatus(byte[] packet) {
            try {
                dtlsTransport.send(packet, 0, packet.length);
                return SendPacketStatus.kSuccess;
            } catch (IOException e) {
                logger.atWarning().log("Failed to send SCTP packet for client " + clientId + ": " + e.getMessage());
                return SendPacketStatus.kError;
            }
        }

        @Override
        public Timeout createTimeout(DelayPrecision delayPrecision) {
            return new Timeout() {
                private ScheduledFuture<?> future;

                @Override
                public synchronized void start(long timeoutMs, long timeoutId) {
                    stop();
                    future = executor.schedule(() -> {
                        if (socket != null) {
                            socket.handleTimeout(timeoutId);
                        }
                    }, timeoutMs, TimeUnit.MILLISECONDS);
                }

                @Override
                public synchronized void stop() {
                    if (future != null) {
                        future.cancel(false);
                        future = null;
                    }
                }
            };
        }

        @Override
        public Instant Now() {
            return Instant.now();
        }

        @Override
        public long getRandomInt(long low, long high) {
            return ThreadLocalRandom.current().nextLong(low, high + 1);
        }

        @Override
        public void OnMessageReceived(DcSctpMessage message) {
            if (listener != null) {
                listener.onMessageReceived(message.getStreamID(), message.getPpid(), message.getPayload());
            }
        }

        @Override
        public void OnError(ErrorKind error, String message) {
            if (error == ErrorKind.kResourceExhaustion) {
                long now = System.currentTimeMillis();
                long last = lastResourceExhaustionLogAt.get();
                if (now - last >= RESOURCE_EXHAUSTION_LOG_INTERVAL_MS
                        && lastResourceExhaustionLogAt.compareAndSet(last, now)) {
                    long suppressed = suppressedResourceExhaustionLogs.getAndSet(0);
                    logger.atWarning().log(
                        "SCTP backpressure for client %s: %s (suppressed=%d in last %ds)",
                        clientId,
                        message,
                        suppressed,
                        RESOURCE_EXHAUSTION_LOG_INTERVAL_MS / 1000
                    );
                } else {
                    suppressedResourceExhaustionLogs.incrementAndGet();
                }
                return;
            }
            logger.atWarning().log("SCTP error for client " + clientId + ": " + error + " - " + message);
        }

        @Override
        public void OnAborted(ErrorKind error, String message) {
            logger.atWarning().log("SCTP aborted for client " + clientId + ": " + error + " - " + message);
            if (listener != null) {
                listener.onError(new IllegalStateException(message));
            }
        }

        @Override
        public void OnConnected() {
            logger.atInfo().log("SCTP connected for client " + clientId);
            if (listener != null) {
                listener.onConnected();
            }
        }

        @Override
        public void OnClosed() {
            logger.atInfo().log("SCTP closed for client " + clientId);
            if (listener != null) {
                listener.onClosed();
            }
        }

        @Override
        public void OnConnectionRestarted() {
            logger.atInfo().log("SCTP connection restarted for client " + clientId);
        }

        @Override
        public void OnStreamsResetFailed(short[] streams, String message) {
            logger.atWarning().log("SCTP streams reset failed for client " + clientId + ": " + message);
        }

        @Override
        public void OnStreamsResetPerformed(short[] streams) {
            logger.atInfo().log("SCTP streams reset performed for client " + clientId);
        }

        @Override
        public void OnIncomingStreamsReset(short[] streams) {
            logger.atInfo().log("SCTP incoming streams reset for client " + clientId);
        }
    }

    public interface SctpTransportListener {
        void onConnected();
        void onClosed();
        void onMessageReceived(short streamId, int ppid, byte[] payload);
        void onError(Exception error);
    }
}
