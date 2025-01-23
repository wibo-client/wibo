package com.wibot.index.operation;

import org.apache.lucene.document.Document;

public class IndexOperation {
    public enum OperationType {
        INSERT,
        DELETE
    }

    private final OperationType type;
    private final String id;
    private final Document document;

    private IndexOperation(OperationType type, String id, Document document) {
        this.type = type;
        this.id = id;
        this.document = document;
    }

    public static IndexOperation createInsert(Document document) {
        return new IndexOperation(OperationType.INSERT, document.get("id"), document);
    }

    public static IndexOperation createDelete(String id) {
        return new IndexOperation(OperationType.DELETE, id, null);
    }

    public OperationType getType() {
        return type;
    }

    public String getId() {
        return id;
    }

    public Document getDocument() {
        return document;
    }
}
