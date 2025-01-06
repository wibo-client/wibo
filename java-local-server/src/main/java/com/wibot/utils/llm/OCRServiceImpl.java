package com.wibot.utils.llm;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.stream.Collectors;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.Media;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;

import com.alibaba.cloud.ai.dashscope.api.DashScopeApi;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatModel;
import com.alibaba.cloud.ai.dashscope.chat.DashScopeChatOptions;
import com.wibot.service.SingletonLLMChat;
import com.wibot.service.SystemConfigService;

@Service
public class OCRServiceImpl implements OCRService {

    private final Logger logger = LoggerFactory.getLogger(OCRServiceImpl.class);

    @Autowired
    private SystemConfigService systemConfigService;

    public OCRServiceImpl() {
    }

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    private int getMaxRetries() {
        return systemConfigService.getIntValue(SystemConfigService.CONFIG_OCR_MAX_RETRIES, 5);
    }

    private String getModel() {
        return systemConfigService.getValue(SystemConfigService.CONFIG_OCR_MODEL, "qwen-vl-max");
    }

    @Override
    public synchronized String recognizeText(BufferedImage image) {
        int retryCount = 0;
        int maxRetries = getMaxRetries();
        String model = getModel();
        String prompt = systemConfigService.getValue("ocr.prompt",
                "请识别一下这个图上的文字，先输出出来，按文字原有语言输出，例如中文就输出中文。然后再用文字描述一下里面的图片或内容，输出格式：图片中的文字：\n 图片中的图形化内容");

        while (retryCount < maxRetries) {
            try {
                logger.info("Attempt {} to recognize text", retryCount + 1);
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                ImageIO.write(image, "png", baos);
                byte[] imageBytes = baos.toByteArray();

                List<Media> mediaList = List.of(new Media(MimeTypeUtils.IMAGE_PNG, imageBytes));
                UserMessage message = new UserMessage(prompt, mediaList);
                message.getMetadata().put("message_format", "image");

                ChatResponse fluxResponse = singletonLLMChat.getChatModel().call(new Prompt(message,
                        DashScopeChatOptions.builder().withModel(model).withMultiModel(true).build()));

                String result = fluxResponse.getResult().getOutput().getContent();
                logger.info("Successfully recognized text: {}", result);
                return result;
            } catch (IOException e) {
                retryCount++;
                logger.error("Failed to recognize text on attempt {}: {}", retryCount, e.getMessage());
                if (retryCount >= maxRetries) {
                    logger.error("Exceeded maximum retry attempts. Giving up.");
                    return "";
                }
            } catch (Exception e) {
                logger.error("Unexpected error during text recognition", e);
                return "";
            }
        }
        return "";
    }

}