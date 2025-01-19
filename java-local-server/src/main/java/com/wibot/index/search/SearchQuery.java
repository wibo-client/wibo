package com.wibot.index.search;

import java.time.LocalDateTime;
import java.util.List;

public class SearchQuery {
    private List<String> exactPhrases;
    private List<String> requiredTerms;
    private List<String> optionalTerms;
    private String originalQuery;
    private String pathPrefix;
    private int topN = 30; // 默认值

    private int lastNDays; // 最近 N 天

    public String getOriginalQuery() {
        return originalQuery;
    }

    public void setOriginalQuery(String originalQuery) {
        this.originalQuery = originalQuery;
    }

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

    // 新增 getter 和 setter
    public int getLastNDays() {
        return lastNDays;
    }

    public void setLastNDays(int lastNDays) {
        this.lastNDays = lastNDays;
    }

    // 获取开始时间
    public LocalDateTime getStartTime() {
        return lastNDays > 0 ? LocalDateTime.now().minusDays(lastNDays) : null;
    }

    // 获取结束时间
    public LocalDateTime getEndTime() {
        return lastNDays > 0 ? LocalDateTime.now() : null;
    }

    // 获取日期排序方式
    public SortOrder getDateSort() {
        return lastNDays > 0 ? SortOrder.DESC : SortOrder.NONE;
    }

    // 日期排序的枚举
    public enum SortOrder {
        ASC, // 升序
        DESC, // 降序
        NONE // 不排序
    }

}
