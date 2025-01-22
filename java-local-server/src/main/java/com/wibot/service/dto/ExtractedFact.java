package com.wibot.service.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;


@JsonIgnoreProperties(ignoreUnknown = true)
public class ExtractedFact {
    private String fact;
    private String id;
    public String getFact() {
        return fact;
    }
    public void setFact(String fact) {
        this.fact = fact;
    }
    public String getId() {
        return id;
    }
    public void setId(String id) {
        this.id = id;
    }
    
}