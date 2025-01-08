package com.wibot.documentParser;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Web Document Parser for MD, HTML, and XML files
 * 
 * 1）读取文本文件（ config ） 2）将内容转换为Markdown格式
 */

@Service
public class ConfigCodeParser extends AbstractDocumentParser {

    private final Logger logger = LoggerFactory.getLogger(TextDocumentParser.class);

    @Override
    protected String parseDocumentInner(DocumentDataPO documentData) {
        List<String> markdownPages = new ArrayList<>();
        logger.info("Starting to parse document: {}", documentData.getFileName());
        try (ByteArrayInputStream inputStream = new ByteArrayInputStream(documentData.getData())) {
            String content = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
            markdownPages.add(content);
        } catch (IOException e) {
            logger.error("Error while parsing document: {}", documentData.getFileName(), e);
        }
        String result = String.join("\n\n", markdownPages);
        logger.info("Finished parsing document: {}", documentData.getFileName());
        return result;
    }

    @Override
    protected String getFileType() {
        return "config";
    }
}