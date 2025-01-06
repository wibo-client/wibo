package com.wibot.documentParser;

import com.wibot.persistence.entity.DocumentDataPO;

public interface DocumentParserInterface {
    String parseDocument(DocumentDataPO documentData);
}
