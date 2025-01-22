package com.wibot.controller.vo;

import java.time.LocalDateTime;

public class RefineryTaskVO {
    private Long id;                     // 任务ID
    private String directoryPath;          // 作用目录（递归）
    private String keyQuestion;            // 关键问题
    private int coveredFileCount;          // 涵盖文件数
    private int fullUpdateTokenCost;       // 上次全量更新所消耗token估算
    private int incrementalTokenCost;      // 上次增量更新所消耗token估算
    private String updateCycle;            // 更新周期（每日/每周/每月）
    private int hitCount;                  // 命中次数
    private LocalDateTime lastUpdateTime;   // 最后更新日期
    private LocalDateTime createTime;       // 创建日期
    private String status;                 // 当前状态（活跃/处理中/失败）
    private String errorMessage;
    private String processingCheckpoint;

    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getDirectoryPath() { return directoryPath; }
    public void setDirectoryPath(String directoryPath) { this.directoryPath = directoryPath; }

    public String getKeyQuestion() { return keyQuestion; }
    public void setKeyQuestion(String keyQuestion) { this.keyQuestion = keyQuestion; }

    public int getCoveredFileCount() { return coveredFileCount; }
    public void setCoveredFileCount(int coveredFileCount) { this.coveredFileCount = coveredFileCount; }

    public int getFullUpdateTokenCost() { return fullUpdateTokenCost; }
    public void setFullUpdateTokenCost(int fullUpdateTokenCost) { this.fullUpdateTokenCost = fullUpdateTokenCost; }

    public int getIncrementalTokenCost() { return incrementalTokenCost; }
    public void setIncrementalTokenCost(int incrementalTokenCost) { this.incrementalTokenCost = incrementalTokenCost; }

    public String getUpdateCycle() { return updateCycle; }
    public void setUpdateCycle(String updateCycle) { this.updateCycle = updateCycle; }

    public int getHitCount() { return hitCount; }
    public void setHitCount(int hitCount) { this.hitCount = hitCount; }

    public LocalDateTime getLastUpdateTime() { return lastUpdateTime; }
    public void setLastUpdateTime(LocalDateTime lastUpdateTime) { this.lastUpdateTime = lastUpdateTime; }

    public LocalDateTime getCreateTime() { return createTime; }
    public void setCreateTime(LocalDateTime createTime) { this.createTime = createTime; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getErrorMessage() { return errorMessage; }
    public void setErrorMessage(String errorMessage) { this.errorMessage = errorMessage; }
    
    public String getProcessingCheckpoint() { return processingCheckpoint; }
    public void setProcessingCheckpoint(String processingCheckpoint) { 
        this.processingCheckpoint = processingCheckpoint; 
    }

}
