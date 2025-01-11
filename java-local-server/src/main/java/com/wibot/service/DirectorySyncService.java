package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.UserDirectoryIndexRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.UserDirectoryIndexPO;

import java.io.IOException;
import java.nio.file.*;
import java.time.ZoneId;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Service
public class DirectorySyncService {
    private static final Logger logger = LoggerFactory.getLogger(DirectorySyncService.class);
    private static final int BATCH_SIZE = 5; // 每批处理文件数
    private static final int PROCESS_DELAY = 1000; // 每批处理后延迟时间(毫秒)

    @Autowired
    private UserDirectoryIndexRepository indexRepository;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @Autowired
    private DirectoryProcessingService directoryProcessingService;

    private final AtomicInteger processingCount = new AtomicInteger(0);

    @Scheduled(fixedRate = 300000) // 5分钟执行一次
    public synchronized void syncDirectories() {
        logger.info("开始目录同步任务");
        List<UserDirectoryIndexPO> completedTasks = indexRepository
                .findByIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);

        for (UserDirectoryIndexPO task : completedTasks) {
            try {
                syncDirectory(task);
            } catch (Exception e) {
                logger.error("同步目录失败: " + task.getDirectoryPath(), e);
            }
        }
    }

    private void syncDirectory(UserDirectoryIndexPO task) throws IOException {
        String directoryPath = task.getDirectoryPath();
        Path dirPath = Paths.get(directoryPath);

        // 修改获取现有文件记录的逻辑，分离正常文件和被忽略的文件
        List<DocumentDataPO> existingDocs = documentDataRepository.findByFilePathStartingWith(directoryPath);

        // 分别处理正常文件和被忽略的文件
        Map<String, DocumentDataPO> normalDocsMap = existingDocs.stream()
                .filter(doc -> !DocumentDataPO.PROCESSED_STATE_DELETED.equals(doc.getProcessedState())
                        && !DocumentDataPO.PROCESSED_STATE_IGNORED.equals(doc.getProcessedState()))
                .collect(Collectors.toMap(DocumentDataPO::getFilePath, doc -> doc));

        Map<String, DocumentDataPO> ignoredDocsMap = existingDocs.stream()
                .filter(doc -> DocumentDataPO.PROCESSED_STATE_IGNORED.equals(doc.getProcessedState()))
                .collect(Collectors.toMap(DocumentDataPO::getFilePath, doc -> doc));

        // 获取当前文件系统中的文件
        Set<String> currentFiles = new HashSet<>();
        try (Stream<Path> paths = Files.walk(dirPath)) {
            paths.filter(Files::isRegularFile).forEach(path -> currentFiles.add(path.toString()));
        }

        // 分析正常文件的变化
        Set<String> newFiles = findNewFiles(currentFiles, normalDocsMap.keySet(), ignoredDocsMap.keySet());
        Set<String> deletedFiles = findDeletedFiles(currentFiles, normalDocsMap.keySet());
        Set<String> updatedFiles = findUpdatedFiles(currentFiles, normalDocsMap);

        // 分析被忽略文件的变化（检查删除）
        Set<String> deletedIgnoredFiles = findDeletedFiles(currentFiles, ignoredDocsMap.keySet());
        // 合并所有需要删除的文件
        deletedFiles.addAll(deletedIgnoredFiles);

        // 处理文件变化
        processBatch(newFiles, StandardWatchEventKinds.ENTRY_CREATE, "新增");
        processBatch(deletedFiles, StandardWatchEventKinds.ENTRY_DELETE, "删除");
        processBatch(updatedFiles, StandardWatchEventKinds.ENTRY_MODIFY, "更新");

        indexRepository.save(task);
    }

    private Set<String> findNewFiles(Set<String> currentFiles, Set<String> existingFiles, Set<String> ignoredFiles) {
        return currentFiles.stream()
                .filter(path -> !existingFiles.contains(path) && !ignoredFiles.contains(path))
                .collect(Collectors.toSet());
    }

    private Set<String> findDeletedFiles(Set<String> currentFiles, Set<String> existingFiles) {
        return existingFiles.stream().filter(path -> !currentFiles.contains(path)).collect(Collectors.toSet());
    }

    private Set<String> findUpdatedFiles(Set<String> currentFiles, Map<String, DocumentDataPO> existingDocsMap) {
        return currentFiles.stream().filter(path -> {
            try {
                DocumentDataPO existingDoc = existingDocsMap.get(path);
                if (existingDoc == null)
                    return false;

                Path filePath = Paths.get(path);
                long lastModified = Files.getLastModifiedTime(filePath).toMillis();
                return lastModified > existingDoc.getUpdateDateTime().atZone(ZoneId.systemDefault()).toInstant()
                        .toEpochMilli();
            } catch (IOException e) {
                logger.error("检查文件更新失败: " + path, e);
                return false;
            }
        }).collect(Collectors.toSet());
    }

    private void processBatch(Set<String> files, WatchEvent.Kind<?> eventKind, String operationType) {
        List<String> fileList = new ArrayList<>(files);
        for (int i = 0; i < fileList.size(); i += BATCH_SIZE) {
            waitForProcessingSlot();

            int end = Math.min(i + BATCH_SIZE, fileList.size());
            List<String> batch = fileList.subList(i, end);

            processBatchFiles(batch, eventKind, operationType);

            delayBetweenBatches();
        }
    }

    private void waitForProcessingSlot() {
        while (processingCount.get() >= BATCH_SIZE) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private void processBatchFiles(List<String> batch, WatchEvent.Kind<?> eventKind, String operationType) {
        processingCount.addAndGet(batch.size());

        for (String file : batch) {
            try {
                logger.info("处理{}文件: {}", operationType, file);
                directoryProcessingService.processFile(Paths.get(file), eventKind);
            } catch (Exception e) {
                logger.error("处理{}文件失败: {}", operationType, file, e);
            } finally {
                processingCount.decrementAndGet();
            }
        }
    }

    private void delayBetweenBatches() {
        try {
            Thread.sleep(PROCESS_DELAY);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
