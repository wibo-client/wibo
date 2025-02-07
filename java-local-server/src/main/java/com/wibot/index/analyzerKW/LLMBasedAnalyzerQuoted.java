package com.wibot.index.analyzerKW;

import org.springframework.ai.chat.client.ChatClient.CallResponseSpec;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions.DashscopeChatOptionsBuilder;
import com.wibot.service.SingletonLLMChat;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class LLMBasedAnalyzerQuoted implements SearchEngineAnalyzer {

    private static final Logger logger = LoggerFactory.getLogger(LLMBasedAnalyzerQuoted.class);

    @Value("classpath:/prompts/tokenAnalyzer.st")
    private Resource tokenAnalyzerPrompt;

    private boolean isDebugModel = false;

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    protected String outputString(List<String> tokens) {
        List<String> quotedTokens = tokens.stream().map(token -> "\"" + token + "\"").collect(Collectors.toList());

        logger.info("Analyze process completed. Tokens: {}", quotedTokens);
        return String.join(" ", quotedTokens);
    }

    @Override
    public String analyze(String query) {
        logger.info("Starting analyze process for query: {}", query);

        Map<String, Object> params = new HashMap<>();
        params.put("userInput", query);
        if (isDebugModel) {
            params.put("DebugModel", ",并且输出理由。");
        } else {
            params.put("DebugModel", ",只输出结果，不要输出理由。");
        }

        List<Message> messages = new ArrayList<>();
        PromptTemplate promptTemplate = new PromptTemplate(tokenAnalyzerPrompt);
        Message userMessage = promptTemplate.createMessage(params);
        messages.add(userMessage);
        DashscopeChatOptionsBuilder opsBuilder = DashScopeChatOptions.builder();
        DashScopeChatOptions ops = opsBuilder.build();

        Prompt analyzePrompt = new Prompt(messages, ops);
        String jsonResult =  singletonLLMChat.sendThrottledRequest(analyzePrompt);
        logger.info("Received JSON result from LLM: {}", jsonResult);

        // Parse the JSON result to extract the tokens
        ObjectMapper objectMapper = new ObjectMapper();
        List<String> tokens = new ArrayList<>();
        int maxRetries = 3;
        int retryCount = 0;

        while (retryCount < maxRetries) {
            try {
                // 检查是否包含 ```json ... ``` 格式
                if (jsonResult.matches("(?s).*```json\\s*\\[(.*?)\\]\\s*```.*")) {
                    logger.debug("Detected markdown json format");
                    // 提取 json 数组部分
                    String arrayPart = jsonResult.replaceAll("(?s).*```json\\s*\\[(.*?)\\]\\s*```.*", "[$1]");
                    logger.debug("Extracted JSON array: {}", arrayPart);
                    jsonResult = arrayPart;
                }
                tokens = objectMapper.readValue(jsonResult, new TypeReference<List<String>>() {
                });
                logger.debug("Parsed tokens: {}", tokens);
                break; // 成功解析，跳出重试循环

            } catch (IOException e) {
                retryCount++;
                if (retryCount >= maxRetries) {
                    logger.error("Failed to parse JSON response after {} retries", maxRetries, e);
                    throw new RuntimeException("Failed to parse JSON response after " + maxRetries + " retries", e);
                }
                logger.warn("Failed to parse JSON response, attempt {}/{}", retryCount, maxRetries);
                try {
                    Thread.sleep(500 * retryCount); // 递增等待时间
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Retry interrupted", ie);
                }
            }
        }
        return outputString(tokens);

    }
}