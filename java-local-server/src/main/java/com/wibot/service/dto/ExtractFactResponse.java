package com.wibot.service.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public class ExtractFactResponse {
    @JsonProperty("answer")
    private List<ExtractedFact> facts;
    
    public List<ExtractedFact> getFacts() { return facts; }
    public void setFacts(List<ExtractedFact> facts) { this.facts = facts; }
}
