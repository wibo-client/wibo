package com.wibot.index;

import com.wibot.persistence.entity.MarkdownParagraphPO;
import com.fasterxml.jackson.annotation.JsonIgnore;

public class SearchDocumentResult {
    protected Long id;

    protected float score;

    protected String highLightContentPart;

    protected String title; // 新增字段
    @JsonIgnore
    protected MarkdownParagraphPO markdownParagraph;

    protected String dateString;

    public void setHighLightContentPart(String content) {
        this.highLightContentPart = content;
    }

    public String getHighLightContentPart() {
        return highLightContentPart;
    }

    public void setScore(float score) {
        this.score = score;
    }

    public float getScore() {
        return score;
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public MarkdownParagraphPO getMarkdownParagraph() {
        return markdownParagraph;
    }

    public void setMarkdownParagraph(MarkdownParagraphPO markdownParagraph) {
        this.markdownParagraph = markdownParagraph;
    }

    public String toString() {
        return "SearchDocumentResult{" + "id=" + id + ", score=" + score + ", highLightContentPart='"
                + highLightContentPart + '\'' + ", title='" + title + '\'' + ", markdownParagraph=" + markdownParagraph
                + '}';
    }
}