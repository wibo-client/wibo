package com.wibot.documentParser;

import org.apache.poi.openxml4j.exceptions.OLE2NotOfficeXmlFileException;
import org.apache.poi.poifs.filesystem.POIFSFileSystem;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;

import org.apache.poi.hwpf.HWPFDocument;
import org.apache.poi.hwpf.extractor.WordExtractor;
import java.io.ByteArrayInputStream;

/**
 * DOCX Document Parser
 * 
 * 1）读取DOCX文件 2）将内容转换为Markdown格式
 */

@Service
public class DOCXDocumentParser extends AbstractDocumentParser {

    private final Logger logger = LoggerFactory.getLogger(DOCXDocumentParser.class);

    @Override
    protected String parseDocumentInner(DocumentDataPO documentData) {
        logger.info("Starting to parse document: {}", documentData.getFileName());

        try (ByteArrayInputStream bis = new ByteArrayInputStream(documentData.getData())) {
            try {
                // 尝试作为DOCX处理
                XWPFDocument document = new XWPFDocument(bis);
                return parseDocx(document);
            } catch (OLE2NotOfficeXmlFileException e) {
                // 如果是旧版DOC文件，重置输入流并用HWPF处理
                bis.reset();
                POIFSFileSystem fs = new POIFSFileSystem(bis);
                HWPFDocument document = new HWPFDocument(fs);
                return parseDoc(document);
            }
        } catch (Exception e) {
            logger.error("Error parsing document: {}", documentData.getFileName(), e);
            return "";
        }
    }

    private String parseDocx(XWPFDocument document) {
        // 原有的DOCX解析逻辑
        StringBuilder markdown = new StringBuilder();
        for (XWPFParagraph paragraph : document.getParagraphs()) {
            markdown.append(paragraph.getText()).append("\n\n");
        }
        return markdown.toString();
    }

    private String parseDoc(HWPFDocument document) {
        // 处理旧版DOC文件
        try (WordExtractor extractor = new WordExtractor(document)) {
            String[] paragraphs = extractor.getParagraphText();
            return String.join("\n\n", paragraphs);
        } catch (Exception e) {
            logger.error("Error extracting text from document", e);
            return "";
        }
    }

    @Override
    protected String getFileType() {
        return "text";
    }
}