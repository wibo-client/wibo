package com.wibot.documentParser;

import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFComment;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.apache.poi.xssf.eventusermodel.XSSFReader;
import org.apache.poi.xssf.model.SharedStringsTable;
import org.apache.poi.openxml4j.opc.OPCPackage;
import org.apache.poi.util.XMLHelper;
import org.xml.sax.ContentHandler;
import org.xml.sax.InputSource;
import org.xml.sax.XMLReader;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler;
import org.apache.poi.xssf.eventusermodel.XSSFSheetXMLHandler.SheetContentsHandler;
import org.apache.poi.xssf.model.StylesTable;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;
import com.alibaba.excel.EasyExcel;
import com.alibaba.excel.read.listener.PageReadListener;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Excel Document Parser
 * 
 * 1）读取Excel文件 2）将每个工作表转换为Markdown格式
 */

@Service
public class XlsxDocumentParser extends AbstractDocumentParser {

    private final Logger logger = LoggerFactory.getLogger(XlsxDocumentParser.class);

    @Override
    protected synchronized String parseDocumentInner(DocumentDataPO documentData) {
        List<String> markdownSheets = new ArrayList<>();
        logger.info("Starting to parse document: {}", documentData.getFileName());

        try (ByteArrayInputStream bis = new ByteArrayInputStream(documentData.getData())) {
            processByEasyExcel(bis, markdownSheets);
        } catch (Exception e) {
            logger.error("Error while parsing document: {}", documentData.getFileName(), e);
        }

        String result = String.join("\n\n", markdownSheets);
        logger.info("Finished parsing document: {}", documentData.getFileName());
        return result;
    }

    private void processByEasyExcel(ByteArrayInputStream bis, List<String> markdownSheets) {
        EasyExcel.read(bis).sheet().headRowNumber(0)
                .registerReadListener(new PageReadListener<Map<Integer, String>>(dataList -> {
                    StringBuilder sheetMarkdown = new StringBuilder();
                    for (Map<Integer, String> rowData : dataList) {
                        List<String> rowCells = new ArrayList<>();
                        for (int colIndex = 0; colIndex < rowData.size(); colIndex++) {
                            rowCells.add(rowData.getOrDefault(colIndex, ""));
                        }
                        sheetMarkdown.append(String.join(" | ", rowCells)).append("\n");
                    }
                    markdownSheets.add(sheetMarkdown.toString());
                })).doRead();
    }
}