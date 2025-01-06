package com.wibot.persistence.entity;

import java.time.LocalDateTime;
import jakarta.persistence.*;

@Entity
public class MarkdownParagraphPO {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Lob
    @Column(name = "content", columnDefinition = "CLOB")
    private String content;
    private LocalDateTime createdDateTime;

    private int paragraphOrder; // 表示段落顺序

    private Long documentDataId;

    private Long markdownBasedContentId;

    public MarkdownParagraphPO() {
    }

    public MarkdownParagraphPO(String content, LocalDateTime createdDateTime) {
        this.content = content;
        this.createdDateTime = createdDateTime;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public LocalDateTime getCreatedDateTime() {
        return createdDateTime;
    }

    public void setCreatedDateTime(LocalDateTime createdDateTime) {
        this.createdDateTime = createdDateTime;
    }

    public int getParagraphOrder() {
        return paragraphOrder;
    }

    public void setParagraphOrder(int paragraphOrder) {
        this.paragraphOrder = paragraphOrder;
    }

    public Long getDocumentDataId() {
        return documentDataId;
    }

    public void setDocumentDataId(Long documentDataId) {
        this.documentDataId = documentDataId;
    }

    public void setMarkdownBasedContentId(Long markdownBasedContentId) {
        this.markdownBasedContentId = markdownBasedContentId;
    }

    public Long getMarkdownBasedContentId() {
        return markdownBasedContentId;
    }
}