package com.wibot.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.time.LocalDateTime;

@Entity
@Table(indexes = { @Index(name = "idx_document_file_path", columnList = "filePath"),
        @Index(name = "idx_document_processed_state", columnList = "processedState"),
        @Index(name = "idx_document_processor_id", columnList = "processorId") })

public class DocumentDataPO {

    public static final String FILE_REQUEST_TYPE_LOCAL = "local";
    public static final String FILE_REQUEST_TYPE_REMOTE = "remote";

    public static final String PROCESSED_STATE_FILE_SAVED = "file_saved";
    public static final String PROCESSED_STATE_FILE_INDEXED = "file_indexed";
    public static final String PROCESSED_ERROR = "error";
    public static final String PROCESSED_STATE_DELETED = "deleted";
    public static final String PROCESSED_STATE_IGNORED = "ignored";
    @Id
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    private String fileName;

    private String extension;

    @Column(unique = true, columnDefinition = "VARCHAR(1024)")
    private String filePath;

    private String md5;

    private LocalDateTime updateDateTime;

    private String processedState = PROCESSED_STATE_FILE_SAVED;

    private long markdownBasedContentId;
    /**
     * 是远程的某个文件，还是本地的某个文件
     */
    private String fileRequestType;

    @Column
    private String processorId;

    @Column
    private LocalDateTime lastProcessingUpdate;

    @Version
    private Integer version;

    public DocumentDataPO() {
        // Default constructor
    }

    public DocumentDataPO(String fileName, String extension, String filePath, String md5, LocalDateTime updateDateTime,
            String processedState, String fileRequestType) {
        this.fileName = fileName;
        this.extension = extension;
        this.filePath = filePath;
        this.md5 = md5;
        this.updateDateTime = updateDateTime;
        this.processedState = processedState;
        this.fileRequestType = fileRequestType;
    }

    // Getter 和 Setter 方法
    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getExtension() {
        return extension;
    }

    public void setExtension(String extension) {
        this.extension = extension;
    }

    public String getFilePath() {
        return filePath;
    }

    public void setFilePath(String filePath) {
        this.filePath = filePath;
    }

    public String getMd5() {
        return md5;
    }

    public void setMd5(String md5) {
        this.md5 = md5;
    }

    public LocalDateTime getUpdateDateTime() {
        return updateDateTime;
    }

    public void setUpdateDateTime(LocalDateTime updateDateTime) {
        this.updateDateTime = updateDateTime;
    }

    public String getProcessedState() {
        return processedState;
    }

    public void setProcessedState(String processedState) {
        this.processedState = processedState;
    }

    public String getFileRequestType() {
        return fileRequestType;
    }

    public void setFileRequestType(String fileRequestType) {
        this.fileRequestType = fileRequestType;
    }

    public String getProcessorId() {
        return processorId;
    }

    public void setProcessorId(String processorId) {
        this.processorId = processorId;
    }

    public LocalDateTime getLastProcessingUpdate() {
        return lastProcessingUpdate;
    }

    public void setLastProcessingUpdate(LocalDateTime lastProcessingUpdate) {
        this.lastProcessingUpdate = lastProcessingUpdate;
    }

    public byte[] getData() throws IOException {
        return Files.readAllBytes(Path.of(filePath));
    }

    public void setMarkdownBasedContentId(long markdownBasedContentId) {
        this.markdownBasedContentId = markdownBasedContentId;
    }

    public long getMarkdownBasedContentId() {
        return markdownBasedContentId;
    }

    public Integer getVersion() {
        return version;
    }

    public void setVersion(Integer version) {
        this.version = version;
    }

}