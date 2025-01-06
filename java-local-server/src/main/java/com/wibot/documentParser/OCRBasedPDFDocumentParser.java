package com.wibot.documentParser;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.service.SystemConfigService;
import com.wibot.utils.llm.OCRService;

/**
 * PDF Document Parser
 * 
 * 1）把pdf的每个页都转换为一个图像 2）把图像传给远端的一个接口，用来做图片的文字识别，
 * 3）把每个页识别好的文字，叠加那个图片，拼装成一个markdown的一段
 */

@Service
public class OCRBasedPDFDocumentParser extends AbstractDocumentParser {

    @Autowired
    private OCRService ocrService;

    @Autowired
    private SystemConfigService systemConfigService;

    private final Logger logger = LoggerFactory.getLogger(OCRBasedPDFDocumentParser.class);

    private int getMinTextLength() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_MIN_TEXT_LENGTH, Integer.class, 100);
    }

    private boolean getPdfUseOCR() {
        return systemConfigService.getConfig(SystemConfigService.CONFIG_PDF_RECOGNITION, Boolean.class, false);
    }

    private String convertToMarkdown(String ocrText, BufferedImage image) {
        // 将OCR识别的文字和图像转换为Markdown格式
        // 这里只是一个简单的示例，可以根据需要进行调整
        StringBuilder markdown = new StringBuilder();
        markdown.append(ocrText);
        markdown.append("\n\n");
        return markdown.toString();
    }

    private boolean isValidText(String text) {
        if (text == null || text.trim().isEmpty()) {
            return false;
        }
        // 移除空白字符后的长度
        int effectiveLength = text.replaceAll("\\s+", "").length();
        return effectiveLength > getMinTextLength();
    }

    @Override
    protected synchronized String parseDocumentInner(DocumentDataPO documentData) {
        List<String> markdownPages = new ArrayList<>();
        logger.info("Starting to parse document: {}", documentData.getFileName());

        try (PDDocument document = PDDocument.load(new ByteArrayInputStream(documentData.getData()))) {
            PDFRenderer pdfRenderer = new PDFRenderer(document);

            for (int page = 0; page < document.getNumberOfPages(); ++page) {
                final int pageNum = page; // 创建final变量

                logger.info("Processing page: {}", pageNum + 1);

                // 先尝试直接提取文本
                String pageText = new PDFTextStripper() {
                    {
                        setStartPage(pageNum + 1);
                        setEndPage(pageNum + 1);
                    }
                }.getText(document);

                String pageOutput = "## Page " + (page + 1) + "\n\n";
                String markdownPage;

                // 判断提取的文本是否有效
                if (isValidText(pageText) || !getPdfUseOCR()) {
                    logger.info("Successfully extracted text from page {}", page + 1);
                    markdownPage = pageText;
                } else {
                    logger.info("No valid text found, using OCR for page {}", page + 1);
                    BufferedImage image = pdfRenderer.renderImageWithDPI(page, 150);
                    String ocrText = ocrService.recognizeText(image);
                    markdownPage = convertToMarkdown(ocrText, image);
                }

                markdownPages.add(pageOutput + markdownPage);
            }
        } catch (IOException e) {
            logger.error("Error while parsing document: {}", documentData.getFileName(), e);
        }

        String result = String.join("\n\n", markdownPages);
        logger.info("Finished parsing document: {}", documentData.getFileName());
        return result;
    }

}
