package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.wibot.persistence.*;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.UserDirectoryIndexPO;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Optional;
import java.util.List;
import java.util.stream.Stream;

@Service
public class DirectoryProcessingService {
    private static final Logger logger = LoggerFactory.getLogger(DirectoryProcessingService.class);

    @Autowired
    private UserDirectoryIndexRepository indexRepository;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    // 每10秒检查新任务
    @Scheduled(fixedRate = 10000)
    public synchronized void processNewTasks() {
        logger.debug("开始检查新任务");

        // 1. 先处理pending状态的任务
        List<UserDirectoryIndexPO> pendingTasks = indexRepository.findAll();
        for (UserDirectoryIndexPO task : pendingTasks) {
            if (task.getIndexStatus().equals(UserDirectoryIndexPO.STATUS_PENDING)) {
                tryProcessTask(task);
            } else if (UserDirectoryIndexPO.STATUS_DELETED.equals(task.getIndexStatus())) {
                processDeletedDirectory(task);
            } else {
                logger.debug("跳过任务: {} ,任务状态{} , 任务目录 {} " + task.getId(), task.getIndexStatus(),
                        task.getDirectoryPath());
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

    private void processDirectory(UserDirectoryIndexPO index) throws Exception {
        Path dirPath = Paths.get(index.getDirectoryPath());

        logger.debug("开始处理目录: {}", index.getDirectoryPath());

        // 处理文件
        try (Stream<Path> paths = Files.walk(dirPath)) {
            paths.filter(Files::isRegularFile).forEach(filePath -> {
                try {
                    processFile(filePath, StandardWatchEventKinds.ENTRY_CREATE);
                } catch (Exception e) {
                    logger.error("处理文件失败: {}", filePath, e);
                    // 继续处理其他文件
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

        // 如果是删除事件，只需要更新状态
        if (kind == StandardWatchEventKinds.ENTRY_DELETE) {
            Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(filePath.toString());
            if (existingDoc.isPresent()) {
                DocumentDataPO doc = existingDoc.get();
                doc.setProcessedState(DocumentDataPO.PROCESSED_STATE_DELETED);
                documentDataRepository.save(doc);
                logger.info("文件已标记为删除: {}", filePath);
            }
            return;
        }

        // 检查文件是否存在且可读
        if (!Files.isReadable(filePath)) {
            throw new IOException("文件不可读: " + filePath);
        }

        // 创建文档数据
        DocumentDataPO documentData = createDocumentData(filePath);

        try {
            // 检查是否存在相同文件
            Optional<DocumentDataPO> existingDoc = documentDataRepository.findByFilePath(documentData.getFilePath());

            if (existingDoc.isPresent()) {
                DocumentDataPO existing = existingDoc.get();
                // 如果MD5相同，跳过处理
                if (existing.getMd5().equals(documentData.getMd5())) {
                    logger.debug("文件未改变，跳过处理: {}", filePath);
                    return;
                } else {
                    // 更新现有记录
                    documentData.setId(existing.getId());
                    documentData.setVersion(existing.getVersion()); // 设置版本号
                    // 重置处理状态
                    documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
                }
            }

            // 保存文档数据
            documentData = documentDataRepository.save(documentData);
            logger.info("保存文档数据: {}", documentData.getFileName());

        } catch (Exception e) {
            logger.error("处理文件失败: " + filePath, e);
        }
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

    private DocumentDataPO createDocumentData(Path filePath) throws IOException {
        DocumentDataPO documentData = new DocumentDataPO();
        documentData.setFileName(filePath.getFileName().toString());
        documentData.setFilePath(filePath.toString());
        documentData.setFileRequestType(DocumentDataPO.FILE_REQUEST_TYPE_LOCAL);
        documentData.setExtension(getFileExtension(filePath.toString()));
        documentData.setUpdateDateTime(
                LocalDateTime.ofInstant(Files.getLastModifiedTime(filePath).toInstant(), ZoneId.systemDefault()));
        documentData.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_SAVED);
        try {
            String md5 = calculateMD5(filePath);
            documentData.setMd5(md5);
        } catch (Exception e) {
            logger.error("计算文件MD5失败: {}", filePath, e);
            throw new IOException("MD5计算失败", e);
        }

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
}
