// package com.wibot.documentParser;

// import java.awt.Graphics2D;
// import java.awt.Image;
// import java.awt.image.BufferedImage;
// import java.io.ByteArrayInputStream;
// import java.io.IOException;
// import java.util.ArrayList;
// import java.util.List;

// import javax.imageio.ImageIO;
// import javax.imageio.stream.ImageInputStream;

// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;
// import org.springframework.beans.factory.annotation.Autowired;
// import org.springframework.stereotype.Service;

// import com.wibot.persistence.entity.DocumentDataPO;
// import com.wibot.utils.llm.OCRService;

// /**
// * HEIC Document Parser
// *
// * 1）读取HEIC图像 2）把图像传给远端的一个接口，用来做图片的文字识别， 3）把识别好的文字，叠加那个图片，拼装成一个markdown的一段
// */

// @Service
// public class HEICDocumentParser extends AbstractDocumentParser {

// @Autowired
// private OCRService ocrService;

// private final Logger logger =
// LoggerFactory.getLogger(HEICDocumentParser.class);

// private static final int MAX_WIDTH = 1500;
// private static final int MAX_HEIGHT = 1500;

// private String convertToMarkdown(String ocrText, BufferedImage image) {
// // 将OCR识别的文字和图像转换为Markdown格式
// // 这里只是一个简单的示例，可以根据需要进行调整
// StringBuilder markdown = new StringBuilder();
// markdown.append(ocrText);
// markdown.append("\n\n");
// return markdown.toString();
// }

// private BufferedImage resizeImage(BufferedImage originalImage, int
// targetWidth, int targetHeight) {
// Image resultingImage = originalImage.getScaledInstance(targetWidth,
// targetHeight, Image.SCALE_SMOOTH);
// BufferedImage outputImage = new BufferedImage(targetWidth, targetHeight,
// BufferedImage.TYPE_INT_RGB);
// Graphics2D g2d = outputImage.createGraphics();
// g2d.drawImage(resultingImage, 0, 0, null);
// g2d.dispose();
// return outputImage;
// }

// private BufferedImage resizeImageIfNecessary(BufferedImage image) {
// int width = image.getWidth();
// int height = image.getHeight();
// if (width > MAX_WIDTH || height > MAX_HEIGHT) {
// float aspectRatio = (float) width / height;
// if (width > height) {
// width = MAX_WIDTH;
// height = Math.round(MAX_WIDTH / aspectRatio);
// } else {
// height = MAX_HEIGHT;
// width = Math.round(MAX_HEIGHT * aspectRatio);
// }
// return resizeImage(image, width, height);
// }
// return image;
// }

// @Override
// protected String parseDocumentInner(DocumentDataPO documentData) {
// List<String> markdownPages = new ArrayList<>();
// logger.info("Starting to parse HEIC document: {}",
// documentData.getFileName());
// try {
// ByteArrayInputStream inputStream = new
// ByteArrayInputStream(documentData.getData());
// try (ImageInputStream imageInputStream =
// ImageIO.createImageInputStream(inputStream)) {
// if (imageInputStream == null) {
// throw new IOException("Cannot create ImageInputStream for HEIC image");
// }

// BufferedImage image = ImageIO.read(imageInputStream);
// if (image == null) {
// throw new IOException(
// "Failed to read HEIC image. Make sure TwelveMonkeys ImageIO is properly
// configured");
// }

// logger.info("Successfully read HEIC image: {}", documentData.getFileName());

// // Resize image if necessary
// image = resizeImageIfNecessary(image);

// String ocrText = ocrService.recognizeText(image);
// logger.debug("OCR text for image {}: {}", documentData.getFileName(),
// ocrText);
// String pageOutput = "## Image " + documentData.getFileName() + "\n\n";
// String markdownPage = convertToMarkdown(ocrText, image);
// markdownPages.add(pageOutput + markdownPage);
// }
// } catch (IOException e) {
// logger.error("Error while parsing HEIC document: {}",
// documentData.getFileName(), e);
// return "Error parsing HEIC image: " + e.getMessage();
// }

// String result = String.join("\n\n", markdownPages);
// logger.info("Finished parsing HEIC document: {}",
// documentData.getFileName());
// return result;
// }
// }