package com.wibot.config;

public class OpenAIConfig {
    private final String baseUrl;
    private final String model;
    private final String apiKey;

    public OpenAIConfig(String baseUrl, String model, String apiKey) {
        this.baseUrl = baseUrl;
        this.model = model;
        this.apiKey = apiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public String getModel() {
        return model;
    }

    public String getApiKey() {
        return apiKey;
    }
}