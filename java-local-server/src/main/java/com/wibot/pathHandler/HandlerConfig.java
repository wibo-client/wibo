package com.wibot.pathHandler;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.*;

@Entity
public class HandlerConfig {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @JsonIgnore
    private Long id;

    @Column(unique = true)
    private String pathPrefix;

    private String handlerName;

    private String config;

    private boolean defaultHandler;

    public HandlerConfig() {
    }

    public HandlerConfig(String pathPrefix, String handlerName, String config, boolean defaultHandler) {
        this.pathPrefix = pathPrefix;
        this.handlerName = handlerName;
        this.config = config;
        this.defaultHandler = defaultHandler;
    }

    // Getters and setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getPathPrefix() {
        return pathPrefix;
    }

    public void setPathPrefix(String pathPrefix) {
        this.pathPrefix = pathPrefix;
    }

    public String getHandlerName() {
        return handlerName;
    }

    public void setHandlerName(String handlerName) {
        this.handlerName = handlerName;
    }

    public String getConfig() {
        return config;
    }

    public void setConfig(String config) {
        this.config = config;
    }

    public boolean isDefaultHandler() {
        return defaultHandler;
    }

    public void setDefaultHandler(boolean defaultHandler) {
        this.defaultHandler = defaultHandler;
    }

}