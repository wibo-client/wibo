package com.wibot.index.search;

import java.util.List;

public class SearchQuery {
    private List<String> exactPhrases;
    private List<String> requiredTerms;
    private List<String> optionalTerms;
    private String pathPrefix;
    private int topN = 30; // 默认值

    public List<String> getExactPhrases() {
        return exactPhrases;
    }

    public void setExactPhrases(List<String> exactPhrases) {
        this.exactPhrases = exactPhrases;
    }

    public List<String> getRequiredTerms() {
        return requiredTerms;
    }

    public void setRequiredTerms(List<String> requiredTerms) {
        this.requiredTerms = requiredTerms;
    }

    public List<String> getOptionalTerms() {
        return optionalTerms;
    }

    public void setOptionalTerms(List<String> optionalTerms) {
        this.optionalTerms = optionalTerms;
    }

    // 添加新的 getter 和 setter
    public String getPathPrefix() {
        return pathPrefix;
    }

    public void setPathPrefix(String pathPrefix) {
        this.pathPrefix = pathPrefix;
    }

    public int getTopN() {
        return topN;
    }

    public void setTopN(int topN) {
        this.topN = topN;
    }

}
