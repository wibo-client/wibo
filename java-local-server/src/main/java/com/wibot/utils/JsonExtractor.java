package com.wibot.utils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class JsonExtractor {
    private static final Logger logger = LoggerFactory.getLogger(JsonExtractor.class);
    
    public static String extractJsonFromResponse(String response) {
        if (response == null || response.trim().isEmpty()) {
            return null;
        }
        
        try {
            // 1. 检查是否包含 Markdown JSON 代码块
            Pattern markdownPattern = Pattern.compile("```json\\s*([\\s\\S]*?)\\s*```");
            Matcher markdownMatcher = markdownPattern.matcher(response);
            if (markdownMatcher.find()) {
                String json = markdownMatcher.group(1).trim();
                logger.debug("Found JSON in markdown block: {}", json);
                return json;
            }
            
            // 2. 检查是否整个响应就是一个JSON (对象或数组)
            String trimmedResponse = response.trim();
            if ((trimmedResponse.startsWith("{") && trimmedResponse.endsWith("}")) ||
                (trimmedResponse.startsWith("[") && trimmedResponse.endsWith("]"))) {
                logger.debug("Found complete JSON: {}", trimmedResponse);
                return trimmedResponse;
            }
            
            // 3. 尝试在文本中查找JSON对象或数组
            Pattern objectPattern = Pattern.compile("\\{[\\s\\S]*?\\}");
            Pattern arrayPattern = Pattern.compile("\\[[\\s\\S]*?\\]");
            
            Matcher arrayMatcher = arrayPattern.matcher(response);
            if (arrayMatcher.find()) {
                String json = arrayMatcher.group().trim();
                logger.debug("Found JSON array in content: {}", json);
                return json;
            }
            
            Matcher objectMatcher = objectPattern.matcher(response);
            if (objectMatcher.find()) {
                String json = objectMatcher.group().trim();
                logger.debug("Found JSON object in content: {}", json);
                return json;
            }
            
            logger.warn("No JSON found in response: {}", response);
            return null;
            
        } catch (Exception e) {
            logger.error("Failed to extract JSON from response", e);
            return null;
        }
    }
}
