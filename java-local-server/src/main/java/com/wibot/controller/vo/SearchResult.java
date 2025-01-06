package com.wibot.controller.vo;

public class SearchResult {

    private String filePath;
    private String highLightContentPart;

    public SearchResult(String filePath, String highLightContentPart) {
        this.filePath = filePath;
        this.highLightContentPart = highLightContentPart;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public String getHighLightContentPart() {
        return highLightContentPart;
    }

    public void setHighLightContentPart(String highLightContentPart) {
        this.highLightContentPart = highLightContentPart;
    }
}
