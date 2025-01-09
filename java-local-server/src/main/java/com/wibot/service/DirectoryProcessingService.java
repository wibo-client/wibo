package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.wibot.documentParser.DocumentParserInterface;
import com.wibot.documentParserSelector.DocumentParserSelectorInterface;
import com.wibot.persistence.*;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.UserDirectoryIndexPO;
import com.wibot.utils.llm.PathMatcherUtil;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Stream;
import java.util.Collections;

@Service
public class DirectoryProcessingService {
    private static final Logger logger = LoggerFactory.getLogger(DirectoryProcessingService.class);
    
    private volatile PathMatcherUtil ignoredPathMatcher;
    private volatile long lastUpdateTime = 0;
    private static final long UPDATE_INTERVAL = 60000; // 60秒更新间隔

    @Autowired
    private UserDirectoryIndexRepository indexRepository;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @Autowired
    private SystemConfigService systemConfigService;
    @Autowired
    private DocumentParserSelectorInterface selector;

    private PathMatcherUtil getIgnoredPathMatcher() {
        long currentTime = System.currentTimeMillis();
        if (ignoredPathMatcher == null || (currentTime - lastUpdateTime) > UPDATE_INTERVAL) {
            synchronized (this) {
                // 双重检查，避免并发更新
                if (ignoredPathMatcher == null || (currentTime - lastUpdateTime) > UPDATE_INTERVAL) {
                    try {
                        String ignoredDirsStr = systemConfigService.getValue(SystemConfigService.CONFIG_IGNORED_DIRECTORIES, "");
                        List<String> ignoredPatterns = Arrays.asList(ignoredDirsStr.split("\n"));
                        ignoredPathMatcher = new PathMatcherUtil(ignoredPatterns);
                        lastUpdateTime = currentTime;
                        logger.debug("已更新忽略规则匹配器，规则数量: {}", ignoredPatterns.size());
                    } catch (Exception e) {
                        logger.error("更新忽略规则匹配器失败", e);
                        // 如果更新失败且没有现有实例，创建一个空的匹配器
                        if (ignoredPathMatcher == null) {
                            ignoredPathMatcher = new PathMatcherUtil(Collections.emptyList());
                        }
                    }
                }
            }
        }
        return ignoredPathMatcher;
    }

    // 每10秒检查新任务
    @Scheduled(fixedRate = 10000)
    public synchronized void processNewTasks() {
        logger.debug("开始检查新任务");

        List<UserDirectoryIndexPO> pendingTasks = indexRepository.findAll();
        for (UserDirectoryIndexPO task : pendingTasks) {
            try {
                if (task.getIndexStatus().equals(UserDirectoryIndexPO.STATUS_PENDING)) {
                    tryProcessTask(task);
                } else if (UserDirectoryIndexPO.STATUS_DELETED.equals(task.getIndexStatus())) {
                    processDeletedDirectory(task);
                } else if (UserDirectoryIndexPO.STATUS_IGNORE_TRIGGERED.equals(task.getIndexStatus())) {
                    processIgnoreRulesChange(task);
                } else {
                    logger.debug("跳过任务: {} ,任务状态{} , 任务目录 {} ", task.getId(), task.getIndexStatus(),
                            task.getDirectoryPath());
                }
            } catch (Exception e) {
                logger.error("处理任务失败: {} - {}", task.getIndexStatus(), task.getDirectoryPath(), e);
            }
        }

    }

    private void tryProcessTask(UserDirectoryIndexPO task) {
        try {
            logger.debug("开始处理目录任务: {}", task.getId());

            processDirectory(task);

        } catch (Exception e) {
            logger.error("处理任务失败: {}", task.getId(), e);
            indexRepository.save(task);
        }
    }

    private void markFileAsIgnored(Path filePath) throws IOException {
        logger.debug("标记文件为忽略状态: {}", filePath);
        Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(filePath.toString());
        
        DocumentDataPO documentData;
        if (existingDoc.isPresent()) {
            documentData = existingDoc.get();
        } else {
            documentData = createDocumentDataWithoutMd5(filePath);
        }
        
        documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
        documentDataRepository.save(documentData);
    }

    private void processDirectory(UserDirectoryIndexPO index) throws Exception {
        Path dirPath = Paths.get(index.getDirectoryPath());

        logger.debug("开始处理目录: {}", index.getDirectoryPath());

        // 处理文件
        try (Stream<Path> paths = Files.walk(dirPath)) {
            paths.filter(Files::isRegularFile)
                .forEach(filePath -> {
                    try {
                        // 使用 getter 方法获取最新的匹配器
                        if (getIgnoredPathMatcher().matches(dirPath.relativize(filePath))) {
                            markFileAsIgnored(filePath);
                            return;
                        }
                        processFile(filePath, StandardWatchEventKinds.ENTRY_CREATE);
                    } catch (Exception e) {
                        logger.error("处理文件失败: {}", filePath, e);
                    }
                });
        }

        index.setIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);
        index.setCompletionTime(LocalDateTime.now());
        indexRepository.save(index);

        logger.debug("目录处理完成: {}", index.getDirectoryPath());
    }

    public synchronized void processFile(Path filePath, WatchEvent.Kind<?> kind) throws Exception {
        logger.debug("开始处理文件: {}, 事件类型: {}", filePath, kind);

        // 处理删除事件
        if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
            handleDeletedFile(filePath);
            return;
        }

        // 检查文件可读性
        if (!Files.isReadable(filePath)) {
            throw new IOException("文件不可读: " + filePath);
        }

        // 创建基础文档数据（不含MD5）
        DocumentDataPO documentData = createDocumentDataWithoutMd5(filePath);
        DocumentParserInterface parser = selector.select(documentData.getExtension());
        boolean shouldProcess = parser.shouldProcess(documentData.getExtension());

        try {
            Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(filePath.toString());
            
            if (existingDoc.isPresent()) {
                handleExistingDocument(existingDoc.get(), documentData, shouldProcess, filePath);
            } else {
                handleNewDocument(documentData, shouldProcess, filePath);
            }

        } catch (Exception e) {
            logger.error("处理文件失败: " + filePath, e);
            throw e;
        }
    }

    private void handleDeletedFile(Path filePath) {
        Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(filePath.toString());
        if (existingDoc.isPresent()) {
            DocumentDataPO doc = existingDoc.get();
            doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_DELETED);
            documentDataRepository.save(doc);
            logger.info("文件已标记为删除: {}", filePath);
        }
    }

    private void handleExistingDocument(DocumentDataPO existing, DocumentDataPO newDoc, boolean shouldProcess, Path filePath) 
            throws Exception {
        if (!shouldProcess) {
            markFileAsIgnored(filePath);
            return;
        }

        // 仅在需要处理的情况下计算MD5
        String newMd5 = calculateMD5(filePath);
        if (existing.getMd5() != null && existing.getMd5().equals(newMd5)) {
            logger.debug("文件未变化，跳过处理: {}", filePath);
            return;
        }

        // 更新现有记录
        newDoc.setId(existing.getId());
        newDoc.setMd5(newMd5);
        newDoc.setVersion(existing.getVersion());
        newDoc.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
        documentDataRepository.save(newDoc);
        logger.debug("更新文件状态: {}", filePath);
    }

    private void handleNewDocument(DocumentDataPO documentData, boolean shouldProcess, Path filePath) throws Exception {
        if (!shouldProcess) {
            documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
            documentDataRepository.save(documentData);
            logger.debug("新文件已标记为忽略: {}", filePath);
            return;
        }

        documentData.setMd5(calculateMD5(filePath));
        documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
        documentDataRepository.save(documentData);
        logger.debug("新文件已保存: {}", filePath);
    }

    public synchronized void handleFileChange(Path file, WatchEvent.Kind<?> kind) {
        try {
            logger.debug("处理文件变化: {} - {}", kind.name(), file);
            if (Files.isRegularFile(file) || kind == StandardWatchEventKinds.ENTRY_DELETE) {
                processFile(file, kind);
            }
        } catch (Exception e) {
            logger.error("处理文件变化失败: " + file, e);
        }
    }

    private DocumentDataPO createDocumentDataWithoutMd5(Path filePath) throws IOException {
        DocumentDataPO documentData = new DocumentDataPO();
        documentData.setFileName(filePath.getFileName().toString());
        documentData.setFilePath(filePath.toString());
        documentData.setFileRequestType(DocumentDataPO.FILE_REQUEST_TYPE_LOCAL);
        documentData.setExtension(getFileExtension(filePath.toString()));
        documentData.setUpdateDateTime(
                LocalDateTime.ofInstant(Files.getLastModifiedTime(filePath).toInstant(), ZoneId.systemDefault()));
        documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
      
        return documentData;
    }

    private String getFileExtension(String fileName) {
        int lastIndexOf = fileName.lastIndexOf(".");
        if (lastIndexOf == -1) {
            return "";
        }
        return fileName.substring(lastIndexOf + 1);
    }

    private String calculateMD5(Path filePath) throws IOException, NoSuchAlgorithmException {
        MessageDigest md = MessageDigest.getInstance("MD5");
        try (InputStream is = Files.newInputStream(filePath)) {
            byte[] buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = is.read(buffer)) != -1) {
                md.update(buffer, 0, bytesRead);
            }
        }
        byte[] md5Bytes = md.digest();
        StringBuilder sb = new StringBuilder();
        for (byte b : md5Bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private synchronized void processDeletedDirectory(UserDirectoryIndexPO task) {
        try {
            logger.debug("开始处理删除目录: {}", task.getDirectoryPath());

            // 查找该目录下的所有文档记录
            List<DocumentDataPO> docs = documentDataRepository.findByFilePathStartingWith(task.getDirectoryPath());

            // 标记所有文档为删除状态
            for (DocumentDataPO doc : docs) {
                doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_DELETED);
                documentDataRepository.save(doc);
                logger.debug("文档已标记为删除: {}", doc.getFilePath());
            }

            // 直接从数据库中删除目录记录
            indexRepository.delete(task);
            logger.debug("目录记录已删除: {}", task.getDirectoryPath());

        } catch (Exception e) {
            logger.error("处理删除目录失败: {}", task.getDirectoryPath(), e);
            indexRepository.save(task);
        }
    }

    public synchronized void reprocessFileForIgnoreRules(Path filePath) throws Exception {
        DocumentDataPO documentData = createDocumentDataWithoutMd5(filePath);
        DocumentParserInterface parser = selector.select(documentData.getExtension());
        boolean shouldProcess = parser.shouldProcess(documentData.getExtension());

        Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(filePath.toString());
        if (existingDoc.isPresent()) {
            DocumentDataPO existing = existingDoc.get();
            if (!shouldProcess) {
                // 如果文件现在应该被忽略
                existing.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
                documentDataRepository.save(existing);
                logger.info("文件状态更新为忽略: {}", filePath);
            }
        }
    }

    // 用于处理忽略规则变化的方法
    public void handleIgnoreRulesChange(String directoryPath) {
        try {
            Path dirPath = Paths.get(directoryPath);
            // 获取所有已索引的文件
            List<DocumentDataPO> indexedDocs = documentDataRepository.findByFilePathStartingWithAndProcessedState(
                directoryPath, DocumentDataPO.PROCESSED_STATE_FILE_INDEXED);

            // 使用 getter 方法获取最新的匹配器
            for (DocumentDataPO doc : indexedDocs) {
                Path filePath = Paths.get(doc.getFilePath());
                if (getIgnoredPathMatcher().matches(dirPath.relativize(filePath))) {
                    doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
                    documentDataRepository.save(doc);
                    logger.info("文件状态更新为忽略: {}", doc.getFilePath());
                }
            }
        } catch (Exception e) {
            logger.error("处理忽略规则变化失败: {}", directoryPath, e);
        }
    }

    private void processIgnoreRulesChange(UserDirectoryIndexPO task) {
        try {
            logger.info("开始处理目录忽略规则变更: {}", task.getDirectoryPath());
            handleIgnoreRulesChange(task.getDirectoryPath());
            
            // 处理完成后更新任务状态
            task.setIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);
            task.setCompletionTime(LocalDateTime.now());
            indexRepository.save(task);
            
            logger.info("目录忽略规则变更处理完成: {}", task.getDirectoryPath());
        } catch (Exception e) {
            logger.error("处理目录忽略规则变更失败: {}", task.getDirectoryPath(), e);
        }
    }

    /**
     * 将所有已完成的目录设置为需要重新评估忽略规则
     */
    public void triggerIgnoreRulesChangeForAllDirectories() {
        try {
            logger.info("开始触发所有目录的忽略规则重新评估");
            
            List<UserDirectoryIndexPO> completedTasks = indexRepository.findByIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);
            
            for (UserDirectoryIndexPO task : completedTasks) {
                try {
                    task.setIndexStatus(UserDirectoryIndexPO.STATUS_IGNORE_TRIGGERED);
                    task.setSubmitTime(LocalDateTime.now()); // 更新提交时间
                    task.setCompletionTime(null); // 清除完成时间
                    indexRepository.save(task);
                    logger.debug("目录已设置为重新评估状态: {}", task.getDirectoryPath());
                } catch (Exception e) {
                    logger.error("设置目录重新评估状态失败: {}", task.getDirectoryPath(), e);
                }
            }
            
            logger.info("已触发 {} 个目录的忽略规则重新评估", completedTasks.size());
        } catch (Exception e) {
            logger.error("触发目录忽略规则重新评估失败", e);
            throw new RuntimeException("触发忽略规则重新评估失败", e);
        }
    }
}
