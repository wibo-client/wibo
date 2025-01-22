package com.wibot.service.dto;

import java.util.List;
import com.fasterxml.jackson.annotation.JsonProperty;

public class ExtractedFact {
    private String fact;
    private String url;
    private String source;
    
    // Getters and setters
    public String getFact() { return fact; }
    public void setFact(String fact) { this.fact = fact; }
    
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}

class ExtractFactResponse {
    @JsonProperty("answer")
    private List<ExtractedFact> facts;
    
    public List<ExtractedFact> getFacts() { return facts; }
    public void setFacts(List<ExtractedFact> facts) { this.facts = facts; }
}
