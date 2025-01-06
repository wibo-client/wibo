package com.wibot.documentParser;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.service.SystemConfigService;
import com.wibot.utils.llm.OCRService;

/**
 * JPG Document Parser
 * 
 * 1）读取JPG图像 2）把图像传给远端的一个接口，用来做图片的文字识别， 3）把识别好的文字，叠加那个图片，拼装成一个markdown的一段
 */

@Service
public class JPGDocumentParser extends AbstractDocumentParser {

    @Autowired
    private OCRService ocrService;

    @Autowired
    private SystemConfigService systemConfigService;

    private final Logger logger = LoggerFactory.getLogger(JPGDocumentParser.class);

    private int getMaxWidth() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_JPG_MAX_WIDTH, Integer.class, 800);
    }

    private int getMaxHeight() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_JPG_MAX_HEIGHT, Integer.class, 800);
    }

    private boolean getJpgUseOCR() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_IMAGE_RECOGNITION, Boolean.class, false);
    }

    private String convertToMarkdown(String ocrText, BufferedImage image) {
        // 将OCR识别的文字和图像转换为Markdown格式
        // 这里只是一个简单的示例，可以根据需要进行调整
        StringBuilder markdown = new StringBuilder();
        markdown.append(ocrText);
        markdown.append("\n\n");
        return markdown.toString();
    }

    private BufferedImage resizeImage(BufferedImage originalImage, int targetWidth, int targetHeight) {
        Image resultingImage = originalImage.getScaledInstance(targetWidth, targetHeight, Image.SCALE_SMOOTH);
        BufferedImage outputImage = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = outputImage.createGraphics();
        g2d.drawImage(resultingImage, 0, 0, null);
        g2d.dispose();
        return outputImage;
    }

    private BufferedImage resizeImageIfNecessary(BufferedImage image) {
        int width = image.getWidth();
        int height = image.getHeight();
        int maxWidth = getMaxWidth();
        int maxHeight = getMaxHeight();

        if (width > maxWidth || height > maxHeight) {
            float aspectRatio = (float) width / height;
            if (width > height) {
                width = maxWidth;
                height = Math.round(maxWidth / aspectRatio);
            } else {
                height = maxHeight;
                width = Math.round(maxHeight * aspectRatio);
            }
            return resizeImage(image, width, height);
        }
        return image;
    }

    @Override
    protected String parseDocumentInner(DocumentDataPO documentData) {
        if (!getJpgUseOCR()) {
            return documentData.getFileName();
        }
        List<String> markdownPages = new ArrayList<>();
        logger.info("Starting to parse document: {}", documentData.getFileName());
        try {
            BufferedImage image = ImageIO.read(new ByteArrayInputStream(documentData.getData()));
            if (image == null) {
                throw new IOException("Failed to read image from data");
            }
            logger.info("Processing image: {}", documentData.getFileName());

            // Resize image if necessary
            image = resizeImageIfNecessary(image);

            String ocrText = ocrService.recognizeText(image);
            logger.debug("OCR text for image {}: {}", documentData.getFileName(), ocrText);
            String pageOutput = "## Image " + documentData.getFileName() + "\n\n";
            String markdownPage = convertToMarkdown(ocrText, image);
            markdownPages.add(pageOutput + markdownPage);
        } catch (IOException e) {
            logger.error("Error while parsing document: {}", documentData.getFileName(), e);
        }
        String result = String.join("\n\n", markdownPages);
        logger.info("Finished parsing document: {}", documentData.getFileName());
        return result;
    }
}