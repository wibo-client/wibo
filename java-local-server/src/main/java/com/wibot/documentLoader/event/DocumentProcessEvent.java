package com.wibot.documentLoader.event;

import com.wibot.persistence.entity.DocumentDataPO;

public class DocumentProcessEvent {
    // 事件类型常量
    public static final String TYPE_BEFORE_MODIFY = "BEFORE_MODIFY"; // 文档修改前
    public static final String TYPE_AFTER_MODIFY = "AFTER_MODIFY"; // 文档修改后
    public static final String TYPE_BEFORE_DELETE = "BEFORE_DELETE"; // 文档删除前
    public static final String TYPE_AFTER_DELETE = "AFTER_DELETE"; // 文档删除后

    private final DocumentDataPO document;
    private final String eventType;

    public DocumentProcessEvent(DocumentDataPO document, String eventType) {
        this.document = document;
        this.eventType = eventType;
    }

    public DocumentDataPO getDocument() {
        return document;
    }

    public String getEventType() {
        return eventType;
    }
}
