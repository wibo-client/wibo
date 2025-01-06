package com.wibot.controller.vo;

import java.time.LocalDateTime;

public class SearchResultVO {
    private Long id;
    private String title;
    private String description;
    private LocalDateTime date;
    private String url;

    public SearchResultVO(Long id, String title, String description, LocalDateTime date, String url) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.date = date;
        this.url = url;
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

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public LocalDateTime getDate() {
        return date;
    }

    public void setDate(LocalDateTime date) {
        this.date = date;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}
