package com.wibot.controller.vo;

import java.time.LocalDateTime;

public class AggregatedContentVO extends SearchResultVO {
    private String content;
    private int paragraphOrder;

    public AggregatedContentVO(Long id, String title, String description, LocalDateTime date, String url,
            String content, int paragraphOrder) {
        super(id, title, description, date, url);
        this.content = content;
        this.paragraphOrder = paragraphOrder;
    }

    // Getters and Setters
    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public int getParagraphOrder() {
        return paragraphOrder;
    }

    public void setParagraphOrder(int paragraphOrder) {
        this.paragraphOrder = paragraphOrder;
    }
}
