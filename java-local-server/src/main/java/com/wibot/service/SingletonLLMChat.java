package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import org.springframework.ai.chat.prompt.Prompt;
import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;

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
    
    private Semaphore throttleSemaphore;  // 移除final修饰符，允许重新初始化
    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 1000; // 重试延迟1秒
    private static final long CONFIG_EXPIRE_INTERVAL = 10000; // 10秒
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

        String apiKey = getApiKeyConf();
        if (apiKey == null || apiKey.isEmpty()) {
            logger.error("API Key is empty. Please set the API Key in the management interface.");
            throw new RuntimeException("API Key is empty. Please set the API Key in the management interface.");
        }
        
        // 初始化并发度信号量
        int concurrency = systemConfigService.getIntValue(SystemConfigService.CONFIG_LLM_CONCURRENCY, 20);
        this.throttleSemaphore = new Semaphore(concurrency);
        logger.info("Initialized LLM concurrency limit to: {}", concurrency);
        
        String chatModelConf = getChatModelConf();

        DashScopeApi dashScopeApi = new DashScopeApi(apiKey);
        this.chatModel = new DashScopeChatModel(dashScopeApi);
        this.chatClient = ChatClient.builder(chatModel)
                .defaultOptions(
                        DashScopeChatOptions.builder().withModel(chatModelConf).withIncrementalOutput(false).build())
                .build();

        this.lastInitTime = System.currentTimeMillis();
        this.inited = true;
        logger.info("LLM chat configuration initialized at: {}", this.lastInitTime);
    }

    private String getChatModelConf() {
        return systemConfigService.getValue(SystemConfigService.CONFIG_CHAT_MODEL, "qwen-plus");
    }

    public ChatClient getChatClient() {
        init();
        return chatClient;
    }

    public ChatModel getChatModel() {
        init();
        return chatModel;
    }

    private String getApiKeyConf() {
        return systemConfigService.getValue(SystemConfigService.CONFIG_API_KEY, "");
    }

    /**
     * 发送带限流和重试机制的LLM请求
     * @param prompt 提示词
     * @return LLM响应内容
     * @throws RuntimeException 如果所有重试都失败
     */
    public String sendThrottledRequest(Prompt prompt) {
        init();
        int attempts = 0;
        while (attempts < MAX_RETRIES) {
            attempts++;
            try {
                // 尝试获取信号量，最多等待10秒
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
                    // 确保释放信号量
                    throttleSemaphore.release();
                }
            } catch (Exception e) {
                logger.warn("Attempt {} failed: {}", attempts, e.getMessage());
                if (attempts >= MAX_RETRIES) {
                    throw new RuntimeException("Failed after " + MAX_RETRIES + " attempts", e);
                }
                try {
                    // 指数退避延迟
                    Thread.sleep(RETRY_DELAY_MS * attempts);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted during retry delay", ie);
                }
            }
        }
        throw new RuntimeException("Failed to send request after " + MAX_RETRIES + " attempts");
    }

    /**
     * 发送带限流和重试机制的ChatModel请求
     * @param prompt 提示词
     * @param options 聊天选项
     * @return ChatResponse 响应对象
     * @throws RuntimeException 如果所有重试都失败
     */
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
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Interrupted during retry delay", ie);
                }
            }
        }
        throw new RuntimeException("Failed to send request after " + MAX_RETRIES + " attempts");
    }

}
