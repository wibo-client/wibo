package com.wibot.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "refinery_task")
public class RefineryTaskDO {
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    
    @Column(nullable = false)
    private String directoryPath;
    
    @Column(nullable = false, length = 1000)
    private String keyQuestion;
    
    private int coveredFileCount;
    private int fullUpdateTokenCost;
    private int incrementalTokenCost;
    
    @Column(nullable = false)
    private String updateCycle;
    
    private int hitCount;
    
    @Column(nullable = false)
    private LocalDateTime lastUpdateTime;
    
    @Column(nullable = false)
    private LocalDateTime createTime;
    
    @Column(nullable = false)
    private String status;
    
    @Column(length = 2000)
    private String errorMessage;  // 错误信息
    
    @Column(length = 2000)
    private String processingCheckpoint;  // 断点续传信息

    // 任务状态常量
    public static final String STATUS_PENDING = "PENDING";      // 待处理
    public static final String STATUS_ACTIVE = "ACTIVE";        // 活跃
    public static final String STATUS_PROCESSING = "PROCESSING"; // 处理中
    public static final String STATUS_FAILED = "FAILED";        // 失败

    // 更新周期常量
    public static final String CYCLE_DAILY = "DAILY";     // 每日
    public static final String CYCLE_WEEKLY = "WEEKLY";   // 每周
    public static final String CYCLE_MONTHLY = "MONTHLY"; // 每月

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getDirectoryPath() {
        return directoryPath;
    }

    public void setDirectoryPath(String directoryPath) {
        this.directoryPath = directoryPath;
    }

    public String getKeyQuestion() {
        return keyQuestion;
    }

    public void setKeyQuestion(String keyQuestion) {
        this.keyQuestion = keyQuestion;
    }

    public int getCoveredFileCount() {
        return coveredFileCount;
    }

    public void setCoveredFileCount(int coveredFileCount) {
        this.coveredFileCount = coveredFileCount;
    }

    public int getFullUpdateTokenCost() {
        return fullUpdateTokenCost;
    }

    public void setFullUpdateTokenCost(int fullUpdateTokenCost) {
        this.fullUpdateTokenCost = fullUpdateTokenCost;
    }

    public int getIncrementalTokenCost() {
        return incrementalTokenCost;
    }

    public void setIncrementalTokenCost(int incrementalTokenCost) {
        this.incrementalTokenCost = incrementalTokenCost;
    }

    public String getUpdateCycle() {
        return updateCycle;
    }

    public void setUpdateCycle(String updateCycle) {
        this.updateCycle = updateCycle;
    }

    public int getHitCount() {
        return hitCount;
    }

    public void setHitCount(int hitCount) {
        this.hitCount = hitCount;
    }

    public LocalDateTime getLastUpdateTime() {
        return lastUpdateTime;
    }

    public void setLastUpdateTime(LocalDateTime lastUpdateTime) {
        this.lastUpdateTime = lastUpdateTime;
    }

    public LocalDateTime getCreateTime() {
        return createTime;
    }

    public void setCreateTime(LocalDateTime createTime) {
        this.createTime = createTime;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public String getProcessingCheckpoint() {
        return processingCheckpoint;
    }

    public void setProcessingCheckpoint(String processingCheckpoint) {
        this.processingCheckpoint = processingCheckpoint;
    }

}
