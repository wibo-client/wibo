package com.wibot.documentParser;

import com.wibot.persistence.entity.DocumentDataPO;

public abstract class AbstractDocumentParser implements DocumentParserInterface {
    @Override
    public String parseDocument(DocumentDataPO documentData) {
        StringBuilder stringBuilder = new StringBuilder();
        stringBuilder.append("# " + documentData.getFileName());
        stringBuilder.append("\n");
        stringBuilder.append("# Document File Name: ");
        stringBuilder.append("\n");
        stringBuilder.append(documentData.getFileName());
        stringBuilder.append("\n");
        stringBuilder.append("# Document Extension: ");
        stringBuilder.append("\n");
        stringBuilder.append(documentData.getExtension());
        stringBuilder.append("\n");
        stringBuilder.append("# Document content: ");
        stringBuilder.append("\n");
        stringBuilder.append(parseDocumentInner(documentData));
        return stringBuilder.toString();
    }

    protected abstract String parseDocumentInner(DocumentDataPO documentData);

}
