package com.wibot.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "refinery_fact",
    indexes = {
        @Index(name = "idx_refinery_task", columnList = "refineryTaskId"),
        @Index(name = "idx_paragraph", columnList = "paragraphId")
    })
public class RefineryFactDO {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private Long refineryTaskId;  // 关联的精炼任务ID
    
    @Column(nullable = false)
    private Long paragraphId;       // 关联的段落ID
    
    @Column(nullable = false, length = 4000)
    private String fact;            // 提取的事实内容
    
    @Column(nullable = false)
    private LocalDateTime createdTime;
    
    // Constructors
    public RefineryFactDO() {}
    
    public RefineryFactDO(Long refineryTaskId, Long paragraphId, String fact) {
        this.refineryTaskId = refineryTaskId;
        this.paragraphId = paragraphId;
        this.fact = fact;
        this.createdTime = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    
    public Long getRefineryTaskId() { return refineryTaskId; }
    public void setRefineryTaskId(Long refineryTaskId) { this.refineryTaskId = refineryTaskId; }
    
    public Long getParagraphId() { return paragraphId; }
    public void setParagraphId(Long paragraphId) { this.paragraphId = paragraphId; }
    
    public String getFact() { return fact; }
    public void setFact(String fact) { this.fact = fact; }
    
    public LocalDateTime getCreatedTime() { return createdTime; }
    public void setCreatedTime(LocalDateTime createdTime) { this.createdTime = createdTime; }
}
