package com.wibot.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import org.springframework.data.jpa.domain.AbstractPersistable;

import com.wibot.markdownService.MarkdownSplitUtil;

@Entity
@Table(indexes = { @Index(name = "idx_document_data_id", columnList = "documentDataId") })
public class MarkdownBasedContentPO extends AbstractPersistable<Long> {
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    @Column(nullable = false)
    private Long documentDataId;

    @Lob
    @Column(name = "content", columnDefinition = "CLOB")
    private String content;
    /**
     * The summary of the content. it can be used to build the index of the content
     * , that can make the search more accurate. 总结内容。可以用来构建内容的索引，使搜索更准确。
     * 在老的实现里，是类似问题，新的实现让他更结构化一些 这样替换的时候也更容易。
     * 
     * @param summary
     */

    private String summary;

    private LocalDateTime createdDateTime;

    private List<Long> paragraphIds;

    public MarkdownBasedContentPO() {
        this.paragraphIds = new ArrayList<>();
    }

    // Getters and Setters
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getDocumentDataId() {
        return documentDataId;
    }

    public void setDocumentDataId(Long documentDataId) {
        this.documentDataId = documentDataId;
    }

    public String getContent() {
        return content;
    }

    public void setContent(String content) {
        this.content = content;
    }

    public LocalDateTime getCreatedDateTime() {
        return createdDateTime;
    }

    public void setCreatedDateTime(LocalDateTime createdDateTime) {
        this.createdDateTime = createdDateTime;
    }

    public String getSummary() {
        return summary;
    }

    public void setSummary(String summary) {
        this.summary = summary;
    }

    public static List<MarkdownParagraphPO> splitContentIntoParagraphs(String content, Long documentDataId,
            Long markdownBasedContentId) {
        // this.paragraphs.clear();
        List<MarkdownParagraphPO> paragraphPOs = new ArrayList<>();
        List<String> contentParagraph = MarkdownSplitUtil.splitContentIfNeed(content);
        for (int i = 0; i < contentParagraph.size(); i++) {

            MarkdownParagraphPO paragraph = new MarkdownParagraphPO(contentParagraph.get(i), LocalDateTime.now());
            paragraph.setParagraphOrder(i);
            paragraph.setDocumentDataId(documentDataId);
            paragraph.setMarkdownBasedContentId(markdownBasedContentId);
            paragraphPOs.add(paragraph);
        }
        return paragraphPOs;
    }

    public void setParagraphIds(List<Long> paragraphIds) {
        this.paragraphIds = paragraphIds;
    }

    public List<Long> getParagraphIds() {
        return paragraphIds;
    }
}