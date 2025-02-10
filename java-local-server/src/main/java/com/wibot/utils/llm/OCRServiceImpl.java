package com.wibot.utils.llm;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.model.Media;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;

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
    public String recognizeText(BufferedImage image) {
        try {
            // 转换图片为字节数组
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            ImageIO.write(image, "png", baos);
            byte[] imageBytes = baos.toByteArray();

            // 获取配置的提示词
            String prompt = systemConfigService.getValue("ocr.prompt",
                    "请识别一下这个图上的文字，先输出出来，按文字原有语言输出，例如中文就输出中文。然后再用文字描述一下里面的图片或内容，输出格式：图片中的文字：\n 图片中的图形化内容");

            // 创建ByteArrayResource
            ByteArrayResource imageResource = new ByteArrayResource(imageBytes);

            // 创建带有图片的消息，使用Resource构造器
            UserMessage message = new UserMessage(prompt,
                    List.of(new Media(MimeTypeUtils.IMAGE_PNG, imageResource)));

            // 设置消息元数据
            message.getMetadata().put("message_format", "image");

            // 创建Prompt并设置模型
            Prompt mediaPrompt = new Prompt(message,
                    OpenAiChatOptions.builder()
                            .model(getModel())
                            .build());

            // 发送请求并获取响应
            ChatResponse response = singletonLLMChat.sendThrottledMediaRequest(mediaPrompt);
            String result = response.getResults().get(0).getOutput().getText();

            logger.info("Successfully recognized text from image");
            return result;

        } catch (IOException e) {
            logger.error("Failed to process image for OCR: {}", e.getMessage());
            return "";
        } catch (Exception e) {
            logger.error("Unexpected error during OCR processing", e);
            return "";
        }
    }

}