package com.wibot.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.wibot.service.ApiKeyService;
import com.wibot.service.DirectoryManagementService;
import com.wibot.service.FileTypeConfigurationService;
import com.wibot.service.RemoteUploadService;
import com.wibot.service.SystemConfigService;
import com.wibot.service.DirectorySyncService;
import java.util.Map;
import java.util.List;
import java.util.HashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Controller
@RequestMapping("/")
public class AdminController {
    private static final Logger logger = LoggerFactory.getLogger(AdminController.class);

    @Autowired
    private SystemConfigService systemConfigService;

    @Autowired
    private ApiKeyService apiKeyService;

    @Autowired
    private DirectoryManagementService directoryManagementService;

    @Autowired
    private FileTypeConfigurationService modelEnhancementService;

    @Autowired
    private RemoteUploadService remoteUploadService;

    @Autowired
    private DirectorySyncService directorySyncService;

    // @GetMapping("/chatClient")
    // public String chatPage() {
    // return "chat";
    // }

    // @GetMapping("/")
    // public String home() {
    // return "chat";
    // }

    // @GetMapping("/admin")
    // public String adminPage() {
    // return "admin";
    // }

    // @GetMapping("/index/status")
    // @ResponseBody
    // public Map<String, Object> getIndexStatus(@RequestParam String path) {
    // return directoryManagementService.getIndexStatus(path);
    // }

    // 获取监控目录列表
    @GetMapping("/admin/list/monitored-dirs")
    @ResponseBody
    public List<Map<String, Object>> listMonitoredDirs() {
        return directoryManagementService.listMonitoredDirs();
    }

    @PostMapping("/admin/toggle-remote-upload")
    @ResponseBody
    public Map<String, Object> toggleRemoteUpload(@RequestBody Map<String, Boolean> request) {
        boolean enable = request.get("enable");
        return remoteUploadService.toggleRemoteUpload(enable);
    }

    @GetMapping("/admin/get-remote-upload-status")
    @ResponseBody
    public Map<String, Object> getRemoteUploadStatus() {
        return remoteUploadService.getRemoteUploadStatus();
    }

    // @GetMapping("/upload")
    // public String uploadPage() {
    // boolean enabled =
    // systemConfigService.getBooleanValue(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED,
    // false);
    // if (!enabled) {
    // return "redirect:/admin"; // 如果功能未启用，重定向到管理页面
    // }
    // return "upload";
    // }

    @PostMapping("/admin/uploadFile")
    @ResponseBody
    public Map<String, Object> handleFileUpload(@RequestParam("file") MultipartFile file,
            @RequestParam("path") String relativePath) {
        return remoteUploadService.handleFileUpload(file, relativePath);
    }

    @PostMapping("/admin/save-ak")
    @ResponseBody
    public Map<String, Object> saveAK(@RequestBody Map<String, String> request) {
        String ak = request.get("ak");
        return apiKeyService.saveAK(ak);
    }

    @GetMapping("/admin/get-ak")
    @ResponseBody
    public Map<String, Object> getAK() {
        return apiKeyService.getAK();
    }

    @PostMapping("/admin/submit/path")
    @ResponseBody
    public Map<String, Object> handlePathSubmission(@RequestBody Map<String, String> request) {
        String path = request.get("path");
        return directoryManagementService.handlePathSubmission(path);
    }

    @PostMapping("/admin/delete/monitored-dir")
    @ResponseBody
    public Map<String, Object> deleteMonitoredDir(@RequestBody Map<String, String> request) {
        String path = request.get("path");
        return directoryManagementService.deleteMonitoredDir(path);
    }

    @GetMapping("/admin/get-upload-config")
    @ResponseBody
    public Map<String, Object> getUploadConfig() {
        return remoteUploadService.getUploadConfig();
    }

    @PostMapping("/admin/update-index-settings")
    @ResponseBody
    public Map<String, Object> updateIndexSettings(@RequestBody Map<String, Object> config) {
        return modelEnhancementService.updateIndexSettings(config);
    }

    @GetMapping("/admin/current-index-settings")
    @ResponseBody
    public Map<String, Object> getCurrentIndexSettings() {
        return modelEnhancementService.getCurrentIndexSettings();
    }

    @PostMapping("/admin/sync-now")
    @ResponseBody
    public Map<String, Object> syncNow() {
        return directorySyncService.manualSync();
    }

    @PostMapping("/admin/sync-config")
    @ResponseBody
    public Map<String, Object> syncConfig(@RequestBody Map<String, Object> request) {
        Map<String, Object> response = new HashMap<>();
        try {
            // 处理 API Key
            String apiKey = (String) request.get("apiKey");
            if (apiKey != null) {
                apiKeyService.saveAK(apiKey);
            }

            // 处理 LLM 并发度
            Object llmConcurrency = request.get("llmConcurrency");
            if (llmConcurrency != null) {
                systemConfigService.saveConfig(SystemConfigService.CONFIG_LLM_CONCURRENCY, 
                    ((Number) llmConcurrency).intValue());
            }

            response.put("success", true);
            response.put("message", "配置同步成功");
        } catch (Exception e) {
            logger.error("配置同步失败", e);
            response.put("success", false);
            response.put("message", "同步失败: " + e.getMessage());
        }
        return response;
    }
}