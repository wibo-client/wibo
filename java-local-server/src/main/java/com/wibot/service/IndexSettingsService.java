package com.wibot.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import java.util.*;

@Service
public class IndexSettingsService {
    @Autowired
    private SystemConfigService systemConfigService;

    @PostConstruct
    public void initDefaultSettings() {
        initSimpleFileTypeConfig("text", true);
        initSimpleFileTypeConfig("spreadsheet", true);
        initSimpleFileTypeConfig("web", true);
        initSimpleFileTypeConfig("code", true);
        initSimpleFileTypeConfig("config", true);
        initSimpleFileTypeConfig("archive", true);

        initEnhancedFileTypeConfig("presentation", true, false);
        initEnhancedFileTypeConfig("pdf", true, false);
        initEnhancedFileTypeConfig("image", true, false);

        initDefaultIgnoredDirectories();
    }

    public Map<String, Object> updateIndexSettings(Map<String, Object> config) {
        Map<String, Object> response = new HashMap<>();
        try {
            Map<String, Object> fileTypes = (Map<String, Object>) config.get("fileTypes");
            updateFileTypeConfigs(fileTypes);
            updateIgnoredDirectories((List<String>) config.get("ignoredDirectories"));
            
            response.put("success", true);
            response.put("message", "索引设置已更新");
        } catch (Exception e) {
            response.put("success", false);
            response.put("message", "更新失败: " + e.getMessage());
        }
        return response;
    }

    private void initDefaultIgnoredDirectories() {
        if (systemConfigService.getValue(SystemConfigService.CONFIG_IGNORED_DIRECTORIES, null) == null) {
            List<String> defaultIgnoredDirs = Arrays.asList(
                ".git", ".svn", "node_modules", "__pycache__",
                ".idea", ".vscode", "target", "build", "dist"
            );
            systemConfigService.saveConfig(
                SystemConfigService.CONFIG_IGNORED_DIRECTORIES,
                String.join("\n", defaultIgnoredDirs)
            );
        }
    }

    private void initSimpleFileTypeConfig(String type, boolean defaultEnabled) {
        String key = "index.filetype." + type + ".enabled";
        if (systemConfigService.getValue(key, null) == null) {
            systemConfigService.saveConfig(key, defaultEnabled);
        }
    }

    private void initEnhancedFileTypeConfig(String type, boolean defaultEnabled, boolean defaultEnhanced) {
        // 初始化启用状态
        String enabledKey = "index.filetype." + type + ".enabled";
        if (systemConfigService.getValue(enabledKey, null) == null) {
            systemConfigService.saveConfig(enabledKey, defaultEnabled);
        }

        // 初始化增强功能状态
        String enhancementKey;
        switch (type) {
            case "image":
                enhancementKey = SystemConfigService.CONFIG_IMAGE_RECOGNITION;
                break;
            case "pdf":
                enhancementKey = SystemConfigService.CONFIG_PDF_RECOGNITION;
                break;
            case "presentation":
                enhancementKey = SystemConfigService.CONFIG_PPT_RECOGNITION;
                break;
            default:
                throw new IllegalArgumentException("Unsupported enhanced file type: " + type);
        }
        
        if (systemConfigService.getValue(enhancementKey, null) == null) {
            systemConfigService.saveConfig(enhancementKey, defaultEnhanced);
        }
    }

    private void updateFileTypeConfigs(Map<String, Object> fileTypes) {
        // 更新基础文件类型配置
        updateBasicFileType(fileTypes, "text");
        updateBasicFileType(fileTypes, "spreadsheet");
        updateBasicFileType(fileTypes, "web");
        updateBasicFileType(fileTypes, "code");
        updateBasicFileType(fileTypes, "config");
        updateBasicFileType(fileTypes, "archive");

        // 更新增强型文件类型配置
        updateEnhancedFileType(fileTypes, "presentation");
        updateEnhancedFileType(fileTypes, "pdf");
        updateEnhancedFileType(fileTypes, "image");
    }

    private void updateBasicFileType(Map<String, Object> fileTypes, String type) {
        Map<String, Object> typeConfig = (Map<String, Object>) fileTypes.get(type);
        Boolean enabled = (Boolean) typeConfig.get("enabled");
        systemConfigService.saveConfig("index.filetype." + type + ".enabled", enabled);
    }

    private void updateEnhancedFileType(Map<String, Object> fileTypes, String type) {
        Map<String, Object> typeConfig = (Map<String, Object>) fileTypes.get(type);
        Boolean enabled = (Boolean) typeConfig.get("enabled");
        Boolean enhanced = (Boolean) typeConfig.get("enhanced");
        
        systemConfigService.saveConfig("index.filetype." + type + ".enabled", enabled);
        
        String enhancementKey;
        switch (type) {
            case "image":
                enhancementKey = SystemConfigService.CONFIG_IMAGE_RECOGNITION;
                break;
            case "pdf":
                enhancementKey = SystemConfigService.CONFIG_PDF_RECOGNITION;
                break;
            case "presentation":
                enhancementKey = SystemConfigService.CONFIG_PPT_RECOGNITION;
                break;
            default:
                throw new IllegalArgumentException("不支持的增强型文件类型: " + type);
        }
        systemConfigService.saveConfig(enhancementKey, enhanced);
    }

    private void updateIgnoredDirectories(List<String> ignoredDirs) {
        if (ignoredDirs != null) {
            systemConfigService.saveConfig(
                SystemConfigService.CONFIG_IGNORED_DIRECTORIES,
                String.join("\n", ignoredDirs)
            );
        }
    }

    // 获取当前索引设置
    public Map<String, Object> getCurrentSettings() {
        Map<String, Object> settings = new HashMap<>();
        Map<String, Object> fileTypes = new HashMap<>();
        
        // 获取基础文件类型设置
        fileTypes.put("text", getBasicFileTypeSettings("text"));
        fileTypes.put("spreadsheet", getBasicFileTypeSettings("spreadsheet"));
        fileTypes.put("web", getBasicFileTypeSettings("web"));
        fileTypes.put("code", getBasicFileTypeSettings("code"));
        fileTypes.put("config", getBasicFileTypeSettings("config"));
        fileTypes.put("archive", getBasicFileTypeSettings("archive"));
        
        // 获取增强型文件类型设置
        fileTypes.put("presentation", getEnhancedFileTypeSettings("presentation"));
        fileTypes.put("pdf", getEnhancedFileTypeSettings("pdf"));
        fileTypes.put("image", getEnhancedFileTypeSettings("image"));
        
        settings.put("fileTypes", fileTypes);
        
        // 获取忽略目录设置
        String ignoredDirsStr = systemConfigService.getValue(
            SystemConfigService.CONFIG_IGNORED_DIRECTORIES, 
            ""
        );
        List<String> ignoredDirs = Arrays.asList(ignoredDirsStr.split("\n"));
        settings.put("ignoredDirectories", ignoredDirs);
        
        return settings;
    }

    private Map<String, Object> getBasicFileTypeSettings(String type) {
        Map<String, Object> settings = new HashMap<>();
        settings.put("enabled", systemConfigService.getBooleanValue(
            "index.filetype." + type + ".enabled",
            false
        ));
        return settings;
    }

    private Map<String, Object> getEnhancedFileTypeSettings(String type) {
        Map<String, Object> settings = new HashMap<>();
        settings.put("enabled", systemConfigService.getBooleanValue(
            "index.filetype." + type + ".enabled",
            false
        ));
        
        String enhancementKey;
        switch (type) {
            case "image":
                enhancementKey = SystemConfigService.CONFIG_IMAGE_RECOGNITION;
                break;
            case "pdf":
                enhancementKey = SystemConfigService.CONFIG_PDF_RECOGNITION;
                break;
            case "presentation":
                enhancementKey = SystemConfigService.CONFIG_PPT_RECOGNITION;
                break;
            default:
                throw new IllegalArgumentException("不支持的增强型文件类型: " + type);
        }
        
        settings.put("enhanced", systemConfigService.getBooleanValue(enhancementKey, false));
        return settings;
    }
}
