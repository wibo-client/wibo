package com.wibot.documentParserSelector;

import com.wibot.documentParser.DocumentParserInterface;

public interface DocumentParserSelectorInterface {
    DocumentParserInterface select(String extension);
}
