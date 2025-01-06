package com.wibot.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.UserDirectoryIndexRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.UserDirectoryIndexPO;
import com.wibot.service.SystemConfigService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.List;
import java.util.ArrayList;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.net.Inet4Address;
import java.net.UnknownHostException;
import java.util.Enumeration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.web.ServerProperties;

@Controller
@RequestMapping("/")
public class AdminController {
    private static final Logger logger = LoggerFactory.getLogger(AdminController.class);

    @Autowired
    private UserDirectoryIndexRepository userDirectoryIndexRepository;

    @Autowired
    private ServerProperties serverProperties;

    @Autowired
    private SystemConfigService systemConfigService;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @GetMapping("/chatClient")
    public String chatPage() {
        return "chat";
    }

    @GetMapping("/")
    public String home() {
        return "chat";
    }

    @GetMapping("/admin")
    public String adminPage() {
        return "admin";
    }

    @PostMapping("/admin/submit/path")
    @ResponseBody
    public Map<String, Object> handlePathSubmission(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        String path = request.get("path");

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

    @GetMapping("/index/status")
    @ResponseBody
    public Map<String, Object> getIndexStatus(@RequestParam String path) {
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

    // 获取监控目录列表
    @GetMapping("/admin/list/monitored-dirs")
    @ResponseBody
    public List<Map<String, Object>> listMonitoredDirs() {
        List<Map<String, Object>> result = new ArrayList<>();
        List<UserDirectoryIndexPO> dirs = userDirectoryIndexRepository.findAll();

        for (UserDirectoryIndexPO dir : dirs) {
            Map<String, Object> dirInfo = new HashMap<>();
            String path = dir.getDirectoryPath();
            dirInfo.put("path", path);

            // 获取该目录下所有文档
            List<DocumentDataPO> docs = documentDataRepository.findByFilePathStartingWith(path);
            int totalDocs = docs.size();

            // 统计已完成索引的文档
            long completedDocs = docs.stream()
                    .filter(doc -> DocumentDataPO.PROCESSED_STATE_FILE_INDEXED.equals(doc.getProcessedState())).count();

            dirInfo.put("fileCount", totalDocs);
            dirInfo.put("completedCount", completedDocs);
            dirInfo.put("completionRate",
                    totalDocs > 0 ? String.format("%.1f%%", (completedDocs * 100.0 / totalDocs)) : "0%");
            result.add(dirInfo);
        }

        return result;
    }

    @PostMapping("/admin/toggle-remote-upload")
    @ResponseBody
    public Map<String, Object> toggleRemoteUpload(@RequestBody Map<String, Boolean> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean enable = request.get("enable");
            systemConfigService.saveConfig(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED, enable);

            if (enable) {
                // 获取当前运行目录
                String currentPath = System.getProperty("user.dir");
                Path remoteFilePath = Paths.get(currentPath, "remoteFile");

                // 创建remoteFile目录
                if (!Files.exists(remoteFilePath)) {
                    Files.createDirectories(remoteFilePath);
                }

                // 获取绝对路径
                String absolutePath = remoteFilePath.toAbsolutePath().toString();

                // 提交为监控目录
                Map<String, String> pathRequest = new HashMap<>();
                pathRequest.put("path", absolutePath);
                handlePathSubmission(pathRequest);

                response.put("success", true);
                response.put("path", absolutePath);
                response.put("message", "远程上传功能已开启");
            } else {
                response.put("success", true);
                response.put("message", "远程上传功能已关闭");
            }

        } catch (Exception e) {
            logger.error("切换远程上传状态失败", e);
            response.put("success", false);
            response.put("message", "操作失败: " + e.getMessage());
        }
        return response;
    }

    @GetMapping("/admin/get-remote-upload-status")
    @ResponseBody
    public Map<String, Object> getRemoteUploadStatus() {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean enabled = systemConfigService.getBooleanValue(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED,
                    false);
            response.put("success", true);
            response.put("enabled", enabled);
        } catch (Exception e) {
            logger.error("获取远程上传状态失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    @GetMapping("/upload")
    public String uploadPage() {
        boolean enabled = systemConfigService.getBooleanValue(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED, false);
        if (!enabled) {
            return "redirect:/admin"; // 如果功能未启用，重定向到管理页面
        }
        return "upload";
    }

    @PostMapping("/admin/uploadFile")
    @ResponseBody
    public Map<String, Object> handleFileUpload(@RequestParam("file") MultipartFile file,
            @RequestParam("path") String relativePath) {
        Map<String, Object> response = new HashMap<>();
        try {
            String currentPath = System.getProperty("user.dir");
            Path remoteFilePath = Paths.get(currentPath, "remoteFile");

            // 确保目标目录存在
            Path targetPath = remoteFilePath.resolve(relativePath);
            Files.createDirectories(targetPath.getParent());

            // 保存文件
            file.transferTo(targetPath);

            response.put("success", true);
            response.put("message", "文件上传成功");
        } catch (Exception e) {
            logger.error("文件上传失败", e);
            response.put("success", false);
            response.put("message", "文件上传失败: " + e.getMessage());
        }
        return response;
    }

    @PostMapping("/admin/save-ak")
    @ResponseBody
    public Map<String, Object> saveAK(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        String ak = request.get("ak");

        try {
            systemConfigService.saveConfig(SystemConfigService.CONFIG_API_KEY, ak);
            response.put("success", true);
            response.put("message", "AK保存成功");
        } catch (Exception e) {
            logger.error("保存AK失败", e);
            response.put("success", false);
            response.put("message", "保存失败: " + e.getMessage());
        }

        return response;
    }

    @GetMapping("/admin/get-ak")
    @ResponseBody
    public Map<String, Object> getAK() {
        Map<String, Object> response = new HashMap<>();
        try {
            String ak = systemConfigService.getValue(SystemConfigService.CONFIG_API_KEY, null);
            response.put("success", true);
            response.put("ak", ak);
        } catch (Exception e) {
            logger.error("获取AK失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    @PostMapping("/admin/delete/monitored-dir")
    @ResponseBody
    public Map<String, Object> deleteMonitoredDir(@RequestBody Map<String, String> request) {
        Map<String, Object> response = new HashMap<>();
        String path = request.get("path");

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

    @PostMapping("/admin/toggle-model-enhancement")
    @ResponseBody
    public Map<String, Object> toggleModelEnhancement(@RequestBody Map<String, Boolean> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean enableImageRecognition = request.getOrDefault("enableImageRecognition", false);
            boolean enablePdfRecognition = request.getOrDefault("enablePdfRecognition", false);
            boolean enablePptRecognition = request.getOrDefault("enablePptRecognition", false);

            systemConfigService.saveConfig(SystemConfigService.CONFIG_IMAGE_RECOGNITION, enableImageRecognition);
            systemConfigService.saveConfig(SystemConfigService.CONFIG_PDF_RECOGNITION, enablePdfRecognition);
            systemConfigService.saveConfig(SystemConfigService.CONFIG_PPT_RECOGNITION, enablePptRecognition);

            response.put("success", true);
            response.put("message", "模型增强选项已更新");
        } catch (Exception e) {
            logger.error("切换模型增强选项失败", e);
            response.put("success", false);
            response.put("message", "操作失败: " + e.getMessage());
        }
        return response;
    }

    @GetMapping("/admin/get-model-enhancement-status")
    @ResponseBody
    public Map<String, Object> getModelEnhancementStatus() {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean imageRecognitionEnabled = systemConfigService
                    .getBooleanValue(SystemConfigService.CONFIG_IMAGE_RECOGNITION, false);
            boolean pdfRecognitionEnabled = systemConfigService
                    .getBooleanValue(SystemConfigService.CONFIG_PDF_RECOGNITION, false);
            boolean pptRecognitionEnabled = systemConfigService
                    .getBooleanValue(SystemConfigService.CONFIG_PPT_RECOGNITION, false);

            response.put("success", true);
            response.put("imageRecognitionEnabled", imageRecognitionEnabled);
            response.put("pdfRecognitionEnabled", pdfRecognitionEnabled);
            response.put("pptRecognitionEnabled", pptRecognitionEnabled);
        } catch (Exception e) {
            logger.error("获取模型增强状态失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    @GetMapping("/admin/get-upload-config")
    @ResponseBody
    public Map<String, Object> getUploadConfig() {
        Map<String, Object> response = new HashMap<>();
        try {
            String currentPath = System.getProperty("user.dir");
            Path remoteFilePath = Paths.get(currentPath, "remoteFile");
            InetAddress localHostAddress = getLocalHostAddress();
            int port = serverProperties.getPort() != null ? serverProperties.getPort() : 8080;

            // 如果端口是80，则省略端口
            String uploadUrl;
            if (port == 80) {
                uploadUrl = "http://" + localHostAddress.getHostAddress() + "/upload";
            } else {
                uploadUrl = "http://" + localHostAddress.getHostAddress() + ":" + port + "/upload";
            }

            String uploadDir = remoteFilePath.toAbsolutePath().toString();

            response.put("success", true);
            response.put("uploadUrl", uploadUrl);
            response.put("uploadDir", uploadDir);
        } catch (Exception e) {
            logger.error("获取上传配置失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    private InetAddress getLocalHostAddress() throws SocketException, UnknownHostException {
        // 优先查找无线网卡
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();

        // 如果未找到无线网卡，按常规逻辑查找可用IPv4地址
        interfaces = NetworkInterface.getNetworkInterfaces();
        while (interfaces.hasMoreElements()) {
            NetworkInterface ni = interfaces.nextElement();
            if (!ni.isUp() || ni.isLoopback() || ni.isVirtual()) {
                continue;
            }
            Enumeration<InetAddress> addresses = ni.getInetAddresses();
            while (addresses.hasMoreElements()) {
                InetAddress addr = addresses.nextElement();
                if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                    return addr;
                }
            }
        }
        // 兜底
        return InetAddress.getLocalHost();
    }
}
