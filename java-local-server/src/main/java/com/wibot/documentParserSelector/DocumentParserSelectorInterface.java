package com.wibot.documentParserSelector;

import com.wibot.documentParser.DocumentParserInterface;
import com.wibot.persistence.entity.DocumentDataPO;

public interface DocumentParserSelectorInterface {
    DocumentParserInterface select(String extension);
}
