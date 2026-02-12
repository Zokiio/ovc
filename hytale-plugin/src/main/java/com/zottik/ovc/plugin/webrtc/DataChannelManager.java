package com.zottik.ovc.plugin.webrtc;

import com.hypixel.hytale.logger.HytaleLogger;
import org.jitsi.dcsctp4j.SendOptions;
import org.jitsi.dcsctp4j.SendStatus;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * DataChannel Establishment Protocol (DCEP) handler for WebRTC.
 * Handles OPEN/ACK control messages and routes binary payloads.
 */
public class DataChannelManager {
    private static final HytaleLogger logger = HytaleLogger.forEnclosingClass();

    // DCEP PPID for control messages
    private static final int PPID_DCEP = 50;

    // Data PPIDs
    private static final int PPID_STRING = 51;
    private static final int PPID_BINARY = 53;
    private static final int PPID_STRING_EMPTY = 57;
    private static final int PPID_BINARY_EMPTY = 56;

    private static final byte DCEP_OPEN = 0x03;
    private static final byte DCEP_ACK = 0x02;
    private static final int CHANNEL_TYPE_UNORDERED_FLAG = 0x80;

    private final String clientId;
    private final SctpTransport sctpTransport;
    private final Map<Short, DataChannel> channels = new ConcurrentHashMap<>();
    private DataChannelListener listener;

    public DataChannelManager(String clientId, SctpTransport sctpTransport) {
        this.clientId = clientId;
        this.sctpTransport = sctpTransport;
    }

    public void setListener(DataChannelListener listener) {
        this.listener = listener;
    }

    /**
     * Handle inbound SCTP messages (control or data).
     */
    public void handleSctpMessage(short streamId, int ppid, byte[] payload) {
        if (ppid == PPID_DCEP) {
            handleControlMessage(streamId, payload);
            return;
        }

        if (ppid == PPID_BINARY || ppid == PPID_BINARY_EMPTY) {
            if (listener != null) {
                listener.onBinaryMessage(streamId, payload);
            }
            return;
        }

        if (ppid == PPID_STRING || ppid == PPID_STRING_EMPTY) {
            if (listener != null) {
                listener.onStringMessage(streamId, new String(payload, StandardCharsets.UTF_8));
            }
        }
    }

    /**
     * Send a binary payload on an open DataChannel.
     */
    public SendStatus sendBinary(short streamId, byte[] payload) {
        int ppid = (payload == null || payload.length == 0) ? PPID_BINARY_EMPTY : PPID_BINARY;
        byte[] data = payload == null ? new byte[0] : payload;
        SendOptions options = new SendOptions();
        DataChannel channel = channels.get(streamId);
        if (channel != null && channel.isUnordered()) {
            options.isUnordered = true;
        }
        return sctpTransport.send(streamId, ppid, data, options);
    }

    private void handleControlMessage(short streamId, byte[] payload) {
        if (payload == null || payload.length == 0) {
            return;
        }

        byte messageType = payload[0];
        if (messageType == DCEP_OPEN) {
            DataChannel channel = parseOpenMessage(streamId, payload);
            channels.put(streamId, channel);

            logger.atInfo().log("DataChannel OPEN received for client " + clientId + ": stream=" + streamId + ", label=" + channel.label);

            // Send ACK
            sctpTransport.send(streamId, PPID_DCEP, new byte[]{DCEP_ACK});

            if (listener != null) {
                listener.onChannelOpen(channel);
            }
        } else if (messageType == DCEP_ACK) {
            DataChannel channel = channels.get(streamId);
            if (channel != null) {
                channel.open = true;
                logger.atInfo().log("DataChannel ACK received for client " + clientId + ": stream=" + streamId);
                if (listener != null) {
                    listener.onChannelOpen(channel);
                }
            }
        } else {
            logger.atWarning().log("Unknown DCEP message type " + messageType + " for client " + clientId);
        }
    }

    private DataChannel parseOpenMessage(short streamId, byte[] payload) {
        ByteBuffer buffer = ByteBuffer.wrap(payload).order(ByteOrder.BIG_ENDIAN);
        
        // DCEP OPEN header: 1 (type) + 1 (channelType) + 2 (priority) + 4 (reliability) + 2 (labelLen) + 2 (protocolLen)
        final int minimumHeaderSize = 1 + 1 + 2 + 4 + 2 + 2;
        if (buffer.remaining() < minimumHeaderSize) {
            logger.atWarning().log("Malformed DCEP OPEN message for client " + clientId + ": insufficient header bytes");
            return new DataChannel(streamId, (byte) 0, (short) 0, 0, "", "");
        }
        
        buffer.get(); // message type
        byte channelType = buffer.get();
        short priority = buffer.getShort();
        int reliabilityParameter = buffer.getInt();
        
        // labelLength and protocolLength are unsigned 16-bit values in DCEP
        int labelLength = Short.toUnsignedInt(buffer.getShort());
        int protocolLength = Short.toUnsignedInt(buffer.getShort());
        
        int remaining = buffer.remaining();
        int totalLength = labelLength + protocolLength;
        
        if (totalLength > remaining) {
            logger.atWarning().log("Malformed DCEP OPEN message for client " + clientId + ": not enough bytes for label/protocol (expected "
                    + totalLength + ", remaining " + remaining + ")");
            return new DataChannel(streamId, channelType, priority, reliabilityParameter, "", "");
        }
        
        byte[] labelBytes = new byte[labelLength];
        buffer.get(labelBytes);
        
        byte[] protocolBytes = new byte[protocolLength];
        buffer.get(protocolBytes);

        String label = new String(labelBytes, StandardCharsets.UTF_8);
        String protocol = new String(protocolBytes, StandardCharsets.UTF_8);

        return new DataChannel(streamId, channelType, priority, reliabilityParameter, label, protocol);
    }

    public static class DataChannel {
        public final short streamId;
        public final byte channelType;
        public final short priority;
        public final int reliabilityParameter;
        public final String label;
        public final String protocol;
        public boolean open = false;

        public DataChannel(short streamId, byte channelType, short priority, int reliabilityParameter, String label, String protocol) {
            this.streamId = streamId;
            this.channelType = channelType;
            this.priority = priority;
            this.reliabilityParameter = reliabilityParameter;
            this.label = label;
            this.protocol = protocol;
        }

        public boolean isUnordered() {
            return (Byte.toUnsignedInt(channelType) & CHANNEL_TYPE_UNORDERED_FLAG) != 0;
        }
    }

    public interface DataChannelListener {
        void onChannelOpen(DataChannel channel);
        void onBinaryMessage(short streamId, byte[] payload);
        void onStringMessage(short streamId, String payload);
    }
}
