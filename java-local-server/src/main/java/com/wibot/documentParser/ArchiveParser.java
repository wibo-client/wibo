package com.wibot.documentParser;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.wibot.persistence.entity.DocumentDataPO;;

@Service
public class ArchiveParser extends AbstractDocumentParser {
    private static final Logger logger = LoggerFactory.getLogger(DefaultParser.class);

    @Override
    protected String parseDocumentInner(DocumentDataPO documentData) {
        logger.info("Parsing document with default parser");
        return "";
    }

    @Override
    protected String getFileType() {
      return "archive";
    }
}
