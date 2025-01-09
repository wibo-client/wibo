package com.wibot.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.UserDirectoryIndexRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.UserDirectoryIndexPO;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class DirectoryManagementService {
    private static final Logger logger = LoggerFactory.getLogger(DirectoryManagementService.class);

    @Autowired
    private UserDirectoryIndexRepository userDirectoryIndexRepository;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    public Map<String, Object> handlePathSubmission(String path) {
        Map<String, Object> response = new HashMap<>();
        try {
            Path dirPath = Paths.get(path);
            if (!Files.exists(dirPath)) {
                throw new RuntimeException("路径不存在");
            }

            Optional<UserDirectoryIndexPO> existingIndex = userDirectoryIndexRepository.findByDirectoryPath(path);
            if (!existingIndex.isPresent()) {
                UserDirectoryIndexPO index = new UserDirectoryIndexPO();
                index.setDirectoryPath(path);
                index.setSubmitTime(LocalDateTime.now());
                index.setIndexStatus(UserDirectoryIndexPO.STATUS_PENDING);
                userDirectoryIndexRepository.save(index);
            }

            response.put("success", true);
            response.put("message", "路径提交成功，系统将开始处理文件");
        } catch (Exception e) {
            logger.error("处理路径提交失败", e);
            response.put("success", false);
            response.put("message", "处理失败: " + e.getMessage());
        }
        return response;
    }

    public List<Map<String, Object>> listMonitoredDirs() {
        List<Map<String, Object>> result = new ArrayList<>();
        List<UserDirectoryIndexPO> dirs = userDirectoryIndexRepository.findAll();

        for (UserDirectoryIndexPO dir : dirs) {
            Map<String, Object> dirInfo = new HashMap<>();
            String path = dir.getDirectoryPath();
            dirInfo.put("path", path);

            List<DocumentDataPO> docs = documentDataRepository.findByFilePathStartingWith(path);
            int totalDocs = docs.size();
            
            // 统计已完成数量（包括已索引和已忽略的文件）
            long completedDocs = docs.stream()
                    .filter(doc -> DocumentDataPO.PROCESSED_STATE_FILE_INDEXED.equals(doc.getProcessedState()) 
                              || DocumentDataPO.PROCESSED_STATE_IGNORED.equals(doc.getProcessedState()))
                    .count();

            dirInfo.put("fileCount", totalDocs);
            dirInfo.put("completedCount", completedDocs);
            dirInfo.put("completionRate",
                    totalDocs > 0 ? String.format("%.1f%%", (completedDocs * 100.0 / totalDocs)) : "0%");
            result.add(dirInfo);
        }
        return result;
    }

    public Map<String, Object> deleteMonitoredDir(String path) {
        Map<String, Object> response = new HashMap<>();
        try {
            Optional<UserDirectoryIndexPO> indexOpt = userDirectoryIndexRepository.findByDirectoryPath(path);
            if (indexOpt.isPresent()) {
                UserDirectoryIndexPO index = indexOpt.get();
                index.setIndexStatus(UserDirectoryIndexPO.STATUS_DELETED);
                index.setCompletionTime(LocalDateTime.now());
                userDirectoryIndexRepository.save(index);

                response.put("success", true);
                response.put("message", "监控目录已标记为删除");
            } else {
                response.put("success", false);
                response.put("message", "未找到该监控目录");
            }
        } catch (Exception e) {
            logger.error("删除监控目录失败", e);
            response.put("success", false);
            response.put("message", "删除失败: " + e.getMessage());
        }
        return response;
    }

    public Map<String, Object> getIndexStatus(String path) {
        Map<String, Object> response = new HashMap<>();
        try {
            Optional<UserDirectoryIndexPO> indexOpt = userDirectoryIndexRepository.findByDirectoryPath(path);
            if (indexOpt.isPresent()) {
                UserDirectoryIndexPO index = indexOpt.get();
                response.put("submitTime", index.getSubmitTime());
                response.put("completionTime", index.getCompletionTime());
                response.put("success", true);
            } else {
                response.put("success", false);
                response.put("message", "未找到索引记录");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", e.getMessage());
        }
        return response;
    }
}
