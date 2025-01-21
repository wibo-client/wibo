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
                // Double-check to avoid concurrent updates
                if (ignoredPathMatcher == null || (currentTime - lastUpdateTime) > UPDATE_INTERVAL) {
                    try {
                        String ignoredDirsStr = systemConfigService
                                .getValue(SystemConfigService.CONFIG_IGNORED_DIRECTORIES, "");
                        List<String> ignoredPatterns = Arrays.asList(ignoredDirsStr.split("\n"));
                        ignoredPathMatcher = new PathMatcherUtil(ignoredPatterns);
                        lastUpdateTime = currentTime;
                        logger.debug("Updated ignore rules matcher, number of rules: {}", ignoredPatterns.size());
                    } catch (Exception e) {
                        logger.error("Failed to update ignore rules matcher", e);
                        // If update fails and there is no existing instance, create an empty matcher
                        if (ignoredPathMatcher == null) {
                            ignoredPathMatcher = new PathMatcherUtil(Collections.emptyList());
                        }
                    }
                }
            }
        }
        return ignoredPathMatcher;
    }

    // Check for new tasks every 10 seconds
    @Scheduled(fixedRate = 10000)
    public synchronized void processNewTasks() {
        logger.debug("Checking for new tasks");

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
                    logger.debug("Skipping task: {} , status: {} , directory: {} ", task.getId(), task.getIndexStatus(),
                            task.getDirectoryPath());
                }
            } catch (Exception e) {
                logger.error("Failed to process task: {} - {}", task.getIndexStatus(), task.getDirectoryPath(), e);
            }
        }

    }

    private void tryProcessTask(UserDirectoryIndexPO task) {
        try {
            logger.debug("Processing directory task: {}", task.getId());

            processDirectory(task);

        } catch (Exception e) {
            logger.error("Failed to process task: {}", task.getId(), e);
            indexRepository.save(task);
        }
    }

    private void markFileAsIgnored(Path filePath) throws IOException {
        logger.debug("Marking file as ignored: {}", filePath);
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

        logger.debug("Processing directory: {}", index.getDirectoryPath());

        // Process files
        try (Stream<Path> paths = Files.walk(dirPath)) {
            paths.filter(Files::isRegularFile)
                    .forEach(filePath -> {
                        try {
                            // Use getter method to get the latest matcher
                            if (getIgnoredPathMatcher().matches(dirPath.relativize(filePath))) {
                                markFileAsIgnored(filePath);
                                return;
                            }
                            processFile(filePath, StandardWatchEventKinds.ENTRY_CREATE);
                        } catch (Exception e) {
                            logger.error("Failed to process file: {}", filePath, e);
                        }
                    });
        }

        index.setIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);
        index.setCompletionTime(LocalDateTime.now());
        indexRepository.save(index);

        logger.debug("Directory processing completed: {}", index.getDirectoryPath());
    }

    public synchronized void processFile(Path filePath, WatchEvent.Kind<?> kind) throws Exception {
        logger.debug("Processing file: {}, event type: {}", filePath, kind);

        // Handle delete event
        if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
            handleDeletedFile(filePath);
            return;
        }

        // Check file readability
        if (!Files.isReadable(filePath)) {
            throw new IOException("File is not readable: " + filePath);
        }

        // Create basic document data (without MD5)
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
            logger.error("Failed to process file: " + filePath, e);
            throw e;
        }
    }

    private void handleDeletedFile(Path filePath) {
        Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(filePath.toString());
        if (existingDoc.isPresent()) {
            DocumentDataPO doc = existingDoc.get();
            doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_DELETED);
            documentDataRepository.save(doc);
            logger.info("File marked as deleted: {}", filePath);
        }
    }

    private void handleExistingDocument(DocumentDataPO existing, DocumentDataPO newDoc, boolean shouldProcess,
            Path filePath)
            throws Exception {
        if (!shouldProcess) {
            markFileAsIgnored(filePath);
            return;
        }

        // Calculate MD5 only if processing is needed
        String newMd5 = calculateMD5(filePath);
        if (existing.getMd5() != null && existing.getMd5().equals(newMd5)) {
            logger.debug("File unchanged, skipping processing: {}", filePath);
            return;
        }

        // Update existing record
        newDoc.setId(existing.getId());
        newDoc.setMd5(newMd5);
        newDoc.setVersion(existing.getVersion());
        newDoc.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
        documentDataRepository.save(newDoc);
        logger.debug("File status updated: {}", filePath);
    }

    private void handleNewDocument(DocumentDataPO documentData, boolean shouldProcess, Path filePath) throws Exception {
        if (!shouldProcess) {
            documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
            documentDataRepository.save(documentData);
            logger.debug("New file marked as ignored: {}", filePath);
            return;
        }

        documentData.setMd5(calculateMD5(filePath));
        documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
        documentDataRepository.save(documentData);
        logger.debug("New file saved: {}", filePath);
    }

    public synchronized void handleFileChange(Path file, WatchEvent.Kind<?> kind) {
        try {
            logger.debug("Handling file change: {} - {}", kind.name(), file);
            if (Files.isRegularFile(file) || kind == StandardWatchEventKinds.ENTRY_DELETE) {
                processFile(file, kind);
            }
        } catch (Exception e) {
            logger.error("Failed to handle file change: " + file, e);
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
            logger.debug("Processing deleted directory: {}", task.getDirectoryPath());

            // Find all document records under this directory
            List<DocumentDataPO> docs = documentDataRepository.findByFilePathStartingWith(task.getDirectoryPath());

            // Mark all documents as deleted
            for (DocumentDataPO doc : docs) {
                doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_DELETED);
                documentDataRepository.save(doc);
                logger.debug("Document marked as deleted: {}", doc.getFilePath());
            }

            // Directly delete the directory record from the database
            indexRepository.delete(task);
            logger.debug("Directory record deleted: {}", task.getDirectoryPath());

        } catch (Exception e) {
            logger.error("Failed to process deleted directory: {}", task.getDirectoryPath(), e);
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
                // If the file should now be ignored
                existing.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
                documentDataRepository.save(existing);
                logger.info("File status updated to ignored: {}", filePath);
            }
        }
    }

    // Method to handle ignore rules changes
    public void handleIgnoreRulesChange(String directoryPath) {
        try {
            Path dirPath = Paths.get(directoryPath);
            // Get all indexed files
            List<DocumentDataPO> indexedDocs = documentDataRepository.findByFilePathStartingWithAndProcessedState(
                    directoryPath, DocumentDataPO.PROCESSED_STATE_FILE_INDEXED);

            // Use getter method to get the latest matcher
            for (DocumentDataPO doc : indexedDocs) {
                Path filePath = Paths.get(doc.getFilePath());
                if (getIgnoredPathMatcher().matches(dirPath.relativize(filePath))) {
                    doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_IGNORED);
                    documentDataRepository.save(doc);
                    logger.info("File status updated to ignored: {}", doc.getFilePath());
                }
            }
        } catch (Exception e) {
            logger.error("Failed to handle ignore rules change: {}", directoryPath, e);
        }
    }

    private void processIgnoreRulesChange(UserDirectoryIndexPO task) {
        try {
            logger.info("Processing directory ignore rules change: {}", task.getDirectoryPath());
            handleIgnoreRulesChange(task.getDirectoryPath());

            // Update task status after processing
            task.setIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);
            task.setCompletionTime(LocalDateTime.now());
            indexRepository.save(task);

            logger.info("Directory ignore rules change processing completed: {}", task.getDirectoryPath());
        } catch (Exception e) {
            logger.error("Failed to process directory ignore rules change: {}", task.getDirectoryPath(), e);
        }
    }

    /**
     * Set all completed directories to require re-evaluation of ignore rules
     */
    public void triggerIgnoreRulesChangeForAllDirectories() {
        try {
            logger.info("Triggering re-evaluation of ignore rules for all directories");

            List<UserDirectoryIndexPO> completedTasks = indexRepository
                    .findByIndexStatus(UserDirectoryIndexPO.STATUS_COMPLETED);

            for (UserDirectoryIndexPO task : completedTasks) {
                try {
                    task.setIndexStatus(UserDirectoryIndexPO.STATUS_IGNORE_TRIGGERED);
                    task.setSubmitTime(LocalDateTime.now()); // Update submit time
                    task.setCompletionTime(null); // Clear completion time
                    indexRepository.save(task);
                    logger.debug("Directory set for re-evaluation: {}", task.getDirectoryPath());
                } catch (Exception e) {
                    logger.error("Failed to set directory for re-evaluation: {}", task.getDirectoryPath(), e);
                }
            }

            logger.info("Triggered re-evaluation of ignore rules for {} directories", completedTasks.size());
        } catch (Exception e) {
            logger.error("Failed to trigger re-evaluation of ignore rules", e);
            throw new RuntimeException("Failed to trigger re-evaluation of ignore rules", e);
        }
    }
}
