package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.retry.RetryUtils;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.reactive.function.client.WebClient;

import com.wibot.config.OpenAIConfig;

import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.OpenAiChatModel;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

@Service
public class SingletonLLMChat {
    private static final Logger logger = LoggerFactory.getLogger(SingletonLLMChat.class);

    @Autowired
    private SystemConfigService systemConfigService;

    private boolean inited = false;
    private ChatClient chatClient;
    private ChatModel chatModel;
    private OpenAIConfig config;

    private Semaphore throttleSemaphore;
    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 1000;
    private static final long CONFIG_EXPIRE_INTERVAL = 10000;
    private long lastInitTime = 0;

    private synchronized void checkConfigExpired() {
        long currentTime = System.currentTimeMillis();
        if (inited && currentTime - lastInitTime > CONFIG_EXPIRE_INTERVAL) {
            logger.debug("Config expired, will reinitialize on next request");
            this.inited = false;
        }
    }

    public synchronized void init() {
        checkConfigExpired();

        if (inited) {
            return;
        }

        String baseUrl = systemConfigService.getValue(SystemConfigService.CONFIG_MODEL_BASE_URL,
                "https://dashscope.aliyuncs.com/compatible-mode/v1");
        // String baseUrl = "https://dashscope.aliyuncs.com/compatible-mode";
        String modelName = getChatModelConf();
        String apiKey = getApiKeyConf();

        if (apiKey == null || apiKey.isEmpty()) {
            throw new RuntimeException("API Key is empty. Please set the API Key in the management interface.");
        }

        // 初始化配置
        config = new OpenAIConfig(baseUrl, modelName, apiKey);

        // 设置并发限制
        int concurrency = systemConfigService.getIntValue(SystemConfigService.CONFIG_LLM_CONCURRENCY, 20);
        this.throttleSemaphore = new Semaphore(concurrency);

        // 创建 OpenAiApi
        OpenAiApi openAiApi = new OpenAiApi(config.getBaseUrl(), config.getApiKey(), "/chat/completions",
                "/embeddings", RestClient.builder(),
                WebClient.builder(), RetryUtils.DEFAULT_RESPONSE_ERROR_HANDLER);

        // 创建 ChatModel
        this.chatModel = new OpenAiChatModel(openAiApi,
                OpenAiChatOptions.builder()
                        .model(config.getModel())
                        .build());

        // 创建 ChatClient
        this.chatClient = ChatClient.create(this.chatModel);

        this.lastInitTime = System.currentTimeMillis();
        this.inited = true;
        logger.info("OpenAI chat configuration initialized with model {} at: {}", config.getModel(), this.lastInitTime);
    }

    private String getChatModelConf() {
        return systemConfigService.getValue(SystemConfigService.CONFIG_CHAT_MODEL, "gpt-3.5-turbo");
    }

    private String getApiKeyConf() {
        return systemConfigService.getValue(SystemConfigService.CONFIG_API_KEY, "");
    }

    public ChatClient getChatClient() {
        init();
        return chatClient;
    }

    public ChatModel getChatModel() {
        init();
        return chatModel;
    }

    public String sendThrottledRequest(Prompt prompt) {
        init();
        int attempts = 0;
        while (attempts < MAX_RETRIES) {
            attempts++;
            try {
                if (!throttleSemaphore.tryAcquire(10, TimeUnit.SECONDS)) {
                    logger.warn("Failed to acquire throttle semaphore after 10 seconds, retrying...");
                    continue;
                }

                try {
                    return getChatClient()
                            .prompt(prompt)
                            .call()
                            .content();
                } finally {
                    throttleSemaphore.release();
                }
            } catch (Exception e) {
                logger.warn("Attempt {} failed: {}", attempts, e.getMessage());
                if (attempts >= MAX_RETRIES) {
                    throw new RuntimeException("Failed after " + MAX_RETRIES + " attempts", e);
                }
                try {
                    Thread.sleep(RETRY_DELAY_MS * attempts);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted during retry delay", ie);
                }
            }
        }
        throw new RuntimeException("Failed to send request after " + MAX_RETRIES + " attempts");
    }

    public ChatResponse sendThrottledMediaRequest(Prompt mediaPrompt) {
        init();
        int attempts = 0;
        while (attempts < MAX_RETRIES) {
            attempts++;
            try {
                if (!throttleSemaphore.tryAcquire(10, TimeUnit.SECONDS)) {
                    logger.warn("Failed to acquire throttle semaphore after 10 seconds, retrying...");
                    continue;
                }

                try {
                    return getChatModel().call(mediaPrompt);
                } finally {
                    throttleSemaphore.release();
                }
            } catch (Exception e) {
                logger.warn("Attempt {} failed: {}", attempts, e.getMessage());
                if (attempts >= MAX_RETRIES) {
                    throw new RuntimeException("Failed after " + MAX_RETRIES + " attempts", e);
                }
                try {
                    Thread.sleep(RETRY_DELAY_MS * attempts);
                } catch (InterruptedException ie) {
                    throw new RuntimeException("Interrupted during retry delay", ie);
                }
            }
        }
        throw new RuntimeException("Failed to send request after " + MAX_RETRIES + " attempts");
    }
}
