package com.wibot.documentParser;

import java.awt.Graphics2D;
import java.awt.Image;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.poi.hslf.usermodel.HSLFSlideShow;
import org.apache.poi.sl.usermodel.Slide;
import org.apache.poi.sl.usermodel.SlideShow;
import org.apache.poi.xslf.usermodel.XMLSlideShow;
import org.apache.poi.xslf.usermodel.XSLFSlide;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.service.SystemConfigService;
import com.wibot.utils.llm.OCRService;

/**
 * PPT Document Parser
 * 
 * 1）读取PPT文件 2）将每一页转换为图像 3）将图像传给远端的一个接口，用来做图片的文字识别
 * 4）将每一页识别好的文字，叠加那个图片，拼装成一个markdown的一段
 */

@Service
public class PPTDocumentParser extends AbstractDocumentParser {

    @Autowired
    private OCRService ocrService;

    @Autowired
    private SystemConfigService systemConfigService;

    private final Logger logger = LoggerFactory.getLogger(PPTDocumentParser.class);

    private int getMaxWidth() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_PPT_MAX_WIDTH, Integer.class, 800);
    }

    private int getMaxHeight() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_PPT_MAX_HEIGHT, Integer.class, 800);
    }

    private int getMinTextLength() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_PPT_MIN_TEXT_LENGTH, Integer.class, 50);
    }

    private boolean getPptUseOCR() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_PPT_RECOGNITION, Boolean.class, false);
    }

    private String extractSlideText(XSLFSlide slide) {
        StringBuilder text = new StringBuilder();
        // 使用正确的类型判断和方法调用
        slide.getShapes().forEach(shape -> {
            if (shape instanceof org.apache.poi.xslf.usermodel.XSLFTextShape) {
                org.apache.poi.xslf.usermodel.XSLFTextShape textShape = (org.apache.poi.xslf.usermodel.XSLFTextShape) shape;
                text.append(textShape.getText()).append("\n");
            }
        });
        return text.toString();
    }

    private boolean isValidText(String text) {
        if (text == null || text.trim().isEmpty()) {
            return false;
        }
        int effectiveLength = text.replaceAll("\\s+", "").length();
        return effectiveLength > getMinTextLength();
    }

    @Override
    protected String parseDocumentInner(DocumentDataPO documentData) {
        List<String> markdownPages = new ArrayList<>();
        logger.info("Starting to parse document: {}", documentData.getFileName());

        try (ByteArrayInputStream bis = new ByteArrayInputStream(documentData.getData())) {
            SlideShow<?, ?> slideShow;
            try {
                // 尝试使用XMLSlideShow处理
                slideShow = new XMLSlideShow(bis);
            } catch (Exception e) {
                // 如果捕获到异常，则使用HSLFSlideShow处理
                logger.warn("文件格式为OLE2，切换到HSLFSlideShow处理: {}", documentData.getFileName());
                slideShow = new HSLFSlideShow(bis);
            }

            int slideNumber = 1;
            for (Slide<?, ?> slide : slideShow.getSlides()) {
                logger.info("Processing slide: {}", slideNumber);

                // 先尝试直接提取文本
                String slideText = extractSlideText((XSLFSlide) slide);
                String slideOutput = "## Slide " + slideNumber + "\n\n";
                String markdownPage;

                if (isValidText(slideText) || !getPptUseOCR()) {
                    logger.info("Successfully extracted text from slide {}", slideNumber);
                    markdownPage = slideText;
                } else {
                    logger.info("No valid text found, using OCR for slide {}", slideNumber);
                    BufferedImage image = renderSlide(slide, 800, 800);
                    image = resizeImageIfNecessary(image);
                    String ocrText = ocrService.recognizeText(image);
                    markdownPage = convertToMarkdown(ocrText, image);
                }

                markdownPages.add(slideOutput + markdownPage);
                slideNumber++;
            }
        } catch (IOException e) {
            logger.error("Error while parsing document: {}", documentData.getFileName(), e);
        }

        String result = String.join("\n\n", markdownPages);
        logger.info("Finished parsing document: {}", documentData.getFileName());
        return result;
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
        BufferedImage outputImage = new BufferedImage(targetWidth, targetHeight, BufferedImage.TYPE_INT_ARGB);
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

    private BufferedImage renderSlide(Slide<?, ?> slide, int width, int height) {
        BufferedImage img = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = img.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        graphics.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        graphics.setRenderingHint(RenderingHints.KEY_ALPHA_INTERPOLATION,
                RenderingHints.VALUE_ALPHA_INTERPOLATION_QUALITY);
        graphics.setRenderingHint(RenderingHints.KEY_COLOR_RENDERING, RenderingHints.VALUE_COLOR_RENDER_QUALITY);
        graphics.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        slide.draw(graphics);
        graphics.dispose();
        return img;
    }

    @Override
    protected String getFileType() {
        return "presentation";
    }

}