package com.hytale.voicechat.plugin.api;

import com.google.gson.Gson;
import com.hytale.voicechat.common.model.PlayerPosition;
import okhttp3.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * REST API client for communicating with the voice server
 */
public class VoiceServerAPIClient {
    private static final Logger logger = LoggerFactory.getLogger(VoiceServerAPIClient.class);
    private static final MediaType JSON = MediaType.get("application/json; charset=utf-8");
    
    private final OkHttpClient httpClient;
    private final Gson gson;
    private final String baseUrl;

    public VoiceServerAPIClient(String serverHost, int apiPort) {
        this.baseUrl = String.format("http://%s:%d", serverHost, apiPort);
        this.gson = new Gson();
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.SECONDS)
                .readTimeout(5, TimeUnit.SECONDS)
                .build();
        
        logger.info("Voice Server API client initialized: {}", baseUrl);
    }

    /**
     * Update player positions on the voice server
     */
    public boolean updatePlayerPositions(List<PlayerPosition> positions) {
        String json = gson.toJson(positions);
        RequestBody body = RequestBody.create(json, JSON);
        
        Request request = new Request.Builder()
                .url(baseUrl + "/api/positions")
                .post(body)
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                logger.warn("Failed to update player positions: HTTP {}", response.code());
                return false;
            }
            return true;
        } catch (IOException e) {
            logger.error("Error updating player positions", e);
            return false;
        }
    }

    /**
     * Notify voice server that a player joined
     */
    public boolean playerJoined(PlayerPosition player) {
        String json = gson.toJson(player);
        RequestBody body = RequestBody.create(json, JSON);
        
        Request request = new Request.Builder()
                .url(baseUrl + "/api/player/join")
                .post(body)
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            return response.isSuccessful();
        } catch (IOException e) {
            logger.error("Error notifying player join", e);
            return false;
        }
    }

    /**
     * Notify voice server that a player left
     */
    public boolean playerLeft(String playerId) {
        Request request = new Request.Builder()
                .url(baseUrl + "/api/player/leave/" + playerId)
                .delete()
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            return response.isSuccessful();
        } catch (IOException e) {
            logger.error("Error notifying player leave", e);
            return false;
        }
    }

    public void close() {
        httpClient.dispatcher().executorService().shutdown();
        httpClient.connectionPool().evictAll();
    }
}
