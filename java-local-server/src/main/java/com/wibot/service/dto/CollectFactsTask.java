package com.wibot.service.dto;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import com.wibot.service.SearchService;

public class CollectFactsTask {
    // 添加任务状态常量
    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_PROCESSING = "PROCESSING";
    public static final String STATUS_COMPLETED = "COMPLETED";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_CANCELLED = "CANCELLED";

    private final Long taskId;
    private final String pathPrefix;
    private final String query;
    private volatile String status = STATUS_PENDING;
    private volatile String error;
    private volatile List<Map<String, Object>> results;
    private SearchStrategy searchStrategy;
    private List<Long> similarTaskIds;
    private final List<String> systemLogs = Collections.synchronizedList(new ArrayList<>());
    private final ConcurrentHashMap<Long, TaskContext> taskContext;

    public CollectFactsTask(Long taskId, String pathPrefix, String query,
            ConcurrentHashMap<Long, TaskContext> taskContext) {
        this.taskId = taskId;
        this.pathPrefix = pathPrefix;
        this.query = query;
        this.taskContext = taskContext;
    }

    private boolean isTerminalStatus(String status) {
        return STATUS_COMPLETED.equals(status) ||
                STATUS_FAILED.equals(status) ||
                STATUS_CANCELLED.equals(status);
    }

    public synchronized Map<String, Object> getStatusMap() {
        Map<String, Object> statusMap = new HashMap<>();
        statusMap.put("taskId", taskId);
        statusMap.put("status", status);
        statusMap.put("error", error);
        statusMap.put("results", results);
        statusMap.put("systemLogs", systemLogs); // 添加系统日志到状态

        // 如果是终态，返回状态后清理任务
        if (isTerminalStatus(status)) {
            taskContext.remove(taskId);
        }

        return statusMap;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    // public String getStatus(){
    // return

    public void setError(String error) {
        this.error = error;
    }

    public String getStatus() {
        return status;
    }

    public void setResults(List<Map<String, Object>> results) {
        this.results = results;
    }

    public Long getTaskId() {
        return taskId;
    }

    public String getPathPrefix() {
        return pathPrefix;
    }

    public String getQuery() {
        return query;
    }

    public void setSearchStrategy(SearchStrategy strategy) {
        this.searchStrategy = strategy;
    }

    public SearchStrategy getSearchStrategy() {
        return searchStrategy;
    }

    public void setSimilarTaskIds(List<Long> taskIds) {
        this.similarTaskIds = taskIds;
    }

    public List<Long> getSimilarTaskIds() {
        return similarTaskIds;
    }

    // 添加日志方法
    public void addSystemLog(String log) {
        systemLogs.add(log);
    }
}