package com.wibot.controller;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import com.wibot.service.ApiKeyService;
import com.wibot.service.DirectoryManagementService;
import com.wibot.service.ModelEnhancementService;
import com.wibot.service.RemoteUploadService;
import com.wibot.service.SystemConfigService;
import java.util.Map;
import java.util.List;
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
    private ModelEnhancementService modelEnhancementService;
    @Autowired
    private RemoteUploadService remoteUploadService;

    @GetMapping("/chatClient")
    public String chatPage() {
        return "chat";
    }

    @GetMapping("/")
    public String home() {
        return "chat";
    }

    // @GetMapping("/admin")
    // public String adminPage() {
    //     return "admin";
    // }

    @PostMapping("/admin/submit/path")
    @ResponseBody
    public Map<String, Object> handlePathSubmission(@RequestBody Map<String, String> request) {
        String path = request.get("path");
        return directoryManagementService.handlePathSubmission(path);
    }

    // @GetMapping("/index/status")
    // @ResponseBody
    // public Map<String, Object> getIndexStatus(@RequestParam String path) {
    //     return directoryManagementService.getIndexStatus(path);
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
    //     boolean enabled = systemConfigService.getBooleanValue(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED, false);
    //     if (!enabled) {
    //         return "redirect:/admin"; // 如果功能未启用，重定向到管理页面
    //     }
    //     return "upload";
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
}