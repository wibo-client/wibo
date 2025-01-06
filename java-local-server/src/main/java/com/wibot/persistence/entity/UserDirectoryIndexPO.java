package com.wibot.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(indexes = { @Index(name = "idx_directory_path", columnList = "directoryPath"),
        @Index(name = "idx_index_status", columnList = "indexStatus") })
public class UserDirectoryIndexPO {

    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_PENDING = "pending"; // 待处理
    public static final String STATUS_DELETED = "deleted"; // 新增删除状态

    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    @Column(nullable = false)
    private String directoryPath;

    @Column(nullable = false)
    private String indexStatus;

    @Column(nullable = false)
    private LocalDateTime submitTime;

    private LocalDateTime completionTime;

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getDirectoryPath() {
        return directoryPath;
    }

    public void setDirectoryPath(String directoryPath) {
        this.directoryPath = directoryPath;
    }

    public String getIndexStatus() {
        return indexStatus;
    }

    public void setIndexStatus(String indexStatus) {
        this.indexStatus = indexStatus;
    }

    public LocalDateTime getSubmitTime() {
        return submitTime;
    }

    public void setSubmitTime(LocalDateTime submitTime) {
        this.submitTime = submitTime;
    }

    public LocalDateTime getCompletionTime() {
        return completionTime;
    }

    public void setCompletionTime(LocalDateTime completionTime) {
        this.completionTime = completionTime;
    }

}
