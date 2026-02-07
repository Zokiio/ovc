package com.hytale.voicechat.common.signaling;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

/**
 * Base class for WebRTC signaling messages
 */
public class SignalingMessage {
    private final String type;
    private final JsonObject data;
    
    public SignalingMessage(String type, JsonObject data) {
        this.type = type;
        this.data = data != null ? data : new JsonObject();
    }
    
    public String getType() {
        return type;
    }
    
    public JsonObject getData() {
        return data;
    }
    
    public String toJson() {
        JsonObject message = new JsonObject();
        message.addProperty("type", type);
        message.add("data", data);
        return message.toString();
    }
    
    public static SignalingMessage fromJson(String json) {
        JsonObject obj = JsonParser.parseString(json).getAsJsonObject();
        String type = obj.get("type").getAsString();
        JsonElement dataElement = obj.get("data");
        JsonObject data = dataElement != null && dataElement.isJsonObject() 
            ? dataElement.getAsJsonObject() 
            : new JsonObject();
        return new SignalingMessage(type, data);
    }
    
    // Message types
    public static final String TYPE_AUTHENTICATE = "authenticate";
    public static final String TYPE_AUTH_SUCCESS = "auth_success";
    public static final String TYPE_AUTH_ERROR = "auth_error";
    public static final String TYPE_HELLO = "hello";
    public static final String TYPE_HEARTBEAT = "heartbeat";
    public static final String TYPE_HEARTBEAT_ACK = "heartbeat_ack";
    public static final String TYPE_RESUME = "resume";
    public static final String TYPE_RESUMED = "resumed";
    public static final String TYPE_OFFER = "offer";
    public static final String TYPE_ANSWER = "answer";
    public static final String TYPE_ICE_CANDIDATE = "ice_candidate";
    public static final String TYPE_AUDIO = "audio";
    public static final String TYPE_USER_MUTE = "user_mute";
    public static final String TYPE_USER_MUTE_STATUS = "user_mute_status";
    public static final String TYPE_SET_MIC_MUTE = "set_mic_mute";
    public static final String TYPE_ERROR = "error";
    public static final String TYPE_DISCONNECT = "disconnect";
}
