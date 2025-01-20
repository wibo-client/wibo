package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;

@Service
@EnableScheduling
public class SingletonLLMChat {
    private static final Logger logger = LoggerFactory.getLogger(SingletonLLMChat.class);
    @Autowired
    private SystemConfigService systemConfigService;

    private boolean inited = false;
    private ChatClient chatClient;
    private ChatModel chatModel;

    public synchronized void init() {
        if (inited) {
            return;
        }
        inited = true;

        String apiKey = getApiKeyConf();

        if (apiKey == null || apiKey.isEmpty()) {
            logger.error("API Key is empty. Please set the API Key in the management interface.");
            throw new RuntimeException("API Key is empty. Please set the API Key in the management interface.");
        }
        String chatModelConf = getChatModelConf();

        DashScopeApi dashScopeApi = new DashScopeApi(apiKey);
        this.chatModel = new DashScopeChatModel(dashScopeApi);
        this.chatClient = ChatClient.builder(chatModel)
                .defaultOptions(
                        DashScopeChatOptions.builder().withModel(chatModelConf).withIncrementalOutput(false).build())
                .build();

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

    @Scheduled(fixedRate = 10000) // 每20秒执行一次
    public synchronized void resetConfig() {
        logger.debug("Resetting LLM chat configuration");
        this.inited = false;
    }

}
