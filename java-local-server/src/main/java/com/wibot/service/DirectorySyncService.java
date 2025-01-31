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
    private static final int BATCH_SIZE = 5; // Number of files processed per batch
    private static final int PROCESS_DELAY = 1000; // Delay time after each batch (milliseconds)

    @Autowired
    private UserDirectoryIndexRepository indexRepository;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @Autowired
    private DirectoryProcessingService directoryProcessingService;

    private final AtomicInteger processingCount = new AtomicInteger(0);

    @Scheduled(fixedRate = 300000) // Execute every 5 minutes
    public synchronized void syncDirectories() {
        logger.info("Starting directory synchronization task");
        List<UserDirectoryIndexPO> completedTasks = indexRepository
                .findByIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);

        for (UserDirectoryIndexPO task : completedTasks) {
            try {
                syncDirectory(task);
            } catch (Exception e) {
                logger.error("Failed to synchronize directory: " + task.getDirectoryPath(), e);
            }
        }
    }

    public synchronized Map<String, Object> manualSync() {
        logger.info("开始手动同步任务");
        Map<String, Object> result = new HashMap<>();

        try {
            List<UserDirectoryIndexPO> completedTasks = indexRepository
                    .findByIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);

            int totalDirs = completedTasks.size();
            int successCount = 0;
            List<String> failedDirs = new ArrayList<>();

            for (UserDirectoryIndexPO task : completedTasks) {
                try {
                    syncDirectory(task);
                    successCount++;
                } catch (Exception e) {
                    String errorMsg = "同步目录失败: " + task.getDirectoryPath();
                    logger.error(errorMsg, e);
                    failedDirs.add(task.getDirectoryPath());
                }
            }

            result.put("success", true);
            result.put("message", String.format("同步完成. 总目录数: %d, 成功: %d, 失败: %d",
                    totalDirs, successCount, failedDirs.size()));
            result.put("totalDirs", totalDirs);
            result.put("successCount", successCount);
            result.put("failedDirs", failedDirs);
        } catch (Exception e) {
            result.put("success", false);
            result.put("message", "同步过程发生错误: " + e.getMessage());
            logger.error("手动同步过程发生错误", e);
        }

        return result;
    }

    private synchronized void syncDirectory(UserDirectoryIndexPO task) throws IOException {
        String directoryPath = task.getDirectoryPath();
        Path dirPath = Paths.get(directoryPath);

        // Modify the logic to get existing file records, separating normal files and
        // ignored files
        List<DocumentDataPO> existingDocs = documentDataRepository.findByFilePathStartingWith(directoryPath);

        // Process normal files and ignored files separately
        Map<String, DocumentDataPO> normalDocsMap = existingDocs.stream()
                .filter(doc -> !DocumentDataPO.PROCESSED_STATE_DELETED.equals(doc.getProcessedState())
                        && !DocumentDataPO.PROCESSED_STATE_IGNORED.equals(doc.getProcessedState()))
                .collect(Collectors.toMap(DocumentDataPO::getFilePath, doc -> doc));

        Map<String, DocumentDataPO> ignoredDocsMap = existingDocs.stream()
                .filter(doc -> DocumentDataPO.PROCESSED_STATE_IGNORED.equals(doc.getProcessedState()))
                .collect(Collectors.toMap(DocumentDataPO::getFilePath, doc -> doc));

        // Get files in the current file system
        Set<String> currentFiles = new HashSet<>();
        try (Stream<Path> paths = Files.walk(dirPath)) {
            paths.filter(Files::isRegularFile).forEach(path -> currentFiles.add(path.toString()));
        }

        // Analyze changes in normal files
        Set<String> newFiles = findNewFiles(currentFiles, normalDocsMap.keySet(), ignoredDocsMap.keySet());
        Set<String> deletedFiles = findDeletedFiles(currentFiles, normalDocsMap.keySet());
        Set<String> updatedFiles = findUpdatedFiles(currentFiles, normalDocsMap);

        // Analyze changes in ignored files (check for deletion)
        Set<String> deletedIgnoredFiles = findDeletedFiles(currentFiles, ignoredDocsMap.keySet());
        // Merge all files to be deleted
        deletedFiles.addAll(deletedIgnoredFiles);

        // Process file changes
        processBatch(newFiles, StandardWatchEventKinds.ENTRY_CREATE, "new");
        processBatch(deletedFiles, StandardWatchEventKinds.ENTRY_DELETE, "delete");
        processBatch(updatedFiles, StandardWatchEventKinds.ENTRY_MODIFY, "update");

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
                logger.error("Failed to check file update: " + path, e);
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
                logger.info("Processing {} file: {}", operationType, file);
                directoryProcessingService.processFile(Paths.get(file), eventKind);
            } catch (Exception e) {
                logger.error("Failed to process {} file: {}", operationType, file, e);
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
