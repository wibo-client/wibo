package com.wibot.rerank;

import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import com.wibot.index.SearchDocumentResult;
import com.wibot.service.SingletonLLMChat;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class LLMBasedRerankImpl implements DocumentRerankInterface {

    private static final Logger logger = LoggerFactory.getLogger(LLMBasedRerankImpl.class);

    @Value("classpath:/prompts/rerankPrompt.st")
    private Resource rerankPrompt;

    private boolean isDebugModel = false;

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    @Override
    public List<SearchDocumentResult> rerank(List<SearchDocumentResult> documentPartList, String queryString) {

        logger.info("Starting rerank process for query: {}", queryString);

        Map<String, Object> params = new HashMap<>();
        params.put("userInput", queryString);

        ObjectMapper mapper = new ObjectMapper();
        String documents;
        try {
            documents = mapper.writeValueAsString(documentPartList);
            logger.debug("Converted documentPartList to JSON: {}", documents);
        } catch (IOException e) {
            logger.error("Failed to convert documentPartList to JSON", e);
            throw new RuntimeException("Failed to convert documentPartList to JSON", e);
        }

        params.put("documents", documents);
        if (isDebugModel) {
            params.put("DebugModel", ",并且输出理由。");
        } else {
            params.put("DebugModel", ",只输出结果，不要输出理由。");
        }

        List<Message> messages = new ArrayList<>();
        PromptTemplate promptTemplate = new PromptTemplate(rerankPrompt);
        Message userMessage = promptTemplate.createMessage(params);
        messages.add(userMessage);
        Prompt knowLodgeEvalPrompt = new Prompt(messages);
        String jsonResult = singletonLLMChat.sendThrottledRequest(knowLodgeEvalPrompt);
        logger.info("Received JSON result from LLM: {}", jsonResult);

        // Parse the JSON result to extract the document IDs in the new order
        ObjectMapper objectMapper = new ObjectMapper();
        List<String> orderedDocIds = new ArrayList<>();
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
                List<Long> numericIds = objectMapper.readValue(jsonResult, new TypeReference<List<Long>>() {
                });
                orderedDocIds = numericIds.stream().map(String::valueOf).collect(Collectors.toList());
                logger.debug("Parsed ordered document IDs: {}", orderedDocIds);
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

        // Create a map for quick lookup of DocumentPart by ID
        Map<String, SearchDocumentResult> documentPartMap = new HashMap<>();
        for (SearchDocumentResult part : documentPartList) {
            documentPartMap.put(String.valueOf(part.getId()), part);
        }

        // Reorder the documentPartList based on the ordered document IDs
        List<SearchDocumentResult> reorderedDocumentParts = new ArrayList<>();
        for (String orderedDocID : orderedDocIds) {
            String docId = orderedDocID;
            if (documentPartMap.containsKey(docId)) {
                reorderedDocumentParts.add(documentPartMap.get(docId));
            }
        }

        logger.info("Rerank process completed. Reordered document parts: {}", reorderedDocumentParts);
        return reorderedDocumentParts;
    }
}