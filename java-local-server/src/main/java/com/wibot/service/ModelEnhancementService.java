package com.wibot.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
@Service
public class ModelEnhancementService {
    private static final Logger logger = LoggerFactory.getLogger(ModelEnhancementService.class);

    @Autowired
    private SystemConfigService systemConfigService;

    // 添加默认配置常量
    private static final Map<String, Object> DEFAULT_CONFIGS = new HashMap<>();
    static {
        // 基础文件类型默认配置
        DEFAULT_CONFIGS.put("filetype.text.enabled", true);
        DEFAULT_CONFIGS.put("filetype.spreadsheet.enabled", true);
        DEFAULT_CONFIGS.put("filetype.web.enabled", true);
        DEFAULT_CONFIGS.put("filetype.code.enabled", true);
        DEFAULT_CONFIGS.put("filetype.config.enabled", true);
        DEFAULT_CONFIGS.put("filetype.archive.enabled", false);

        // 增强型文件类型默认配置
        DEFAULT_CONFIGS.put("filetype.presentation.enabled", true);
        DEFAULT_CONFIGS.put("filetype.pdf.enabled", true);
        DEFAULT_CONFIGS.put("filetype.image.enabled", true);
        DEFAULT_CONFIGS.put(SystemConfigService.CONFIG_IMAGE_RECOGNITION, false);
        DEFAULT_CONFIGS.put(SystemConfigService.CONFIG_PDF_RECOGNITION, false);
        DEFAULT_CONFIGS.put(SystemConfigService.CONFIG_PPT_RECOGNITION, false);

        // 默认忽略目录
        DEFAULT_CONFIGS.put(SystemConfigService.CONFIG_IGNORED_DIRECTORIES, 
            "node_modules\n.git\n.idea\n.vscode\ntarget\nbuild");
    }

    @jakarta.annotation.PostConstruct
    public void initializeDefaultConfigs() {
        try {
            for (Map.Entry<String, Object> entry : DEFAULT_CONFIGS.entrySet()) {
                String key = entry.getKey();
                if (!systemConfigService.hasConfig(key)) {
                    systemConfigService.saveConfig(key, entry.getValue());
                    logger.info("Initialized default config for key: {}", key);
                }
            }
        } catch (Exception e) {
            logger.error("Failed to initialize default configs", e);
        }
    }



    public Map<String, Object> updateIndexSettings(Map<String, Object> config) {
        Map<String, Object> response = new HashMap<>();
        try {
            Map<String, Object> fileTypes = (Map<String, Object>) config.get("fileTypes");
            
            // 处理简单文件类型
            processSimpleFileType(fileTypes, "text");
            processSimpleFileType(fileTypes, "spreadsheet");
            processSimpleFileType(fileTypes, "web");
            processSimpleFileType(fileTypes, "code");
            processSimpleFileType(fileTypes, "config");
            processSimpleFileType(fileTypes, "archive");

            // 处理增强型文件类型
            processEnhancedFileType(fileTypes, "presentation");
            processEnhancedFileType(fileTypes, "pdf");
            processEnhancedFileType(fileTypes, "image");

            // 处理忽略目录
            List<String> ignoredDirs = (List<String>) config.get("ignoredDirectories");
            if (ignoredDirs != null) {
                systemConfigService.saveConfig(SystemConfigService.CONFIG_IGNORED_DIRECTORIES, 
                    String.join("\n", ignoredDirs));
            }

            response.put("success", true);
            response.put("message", "索引设置已更新");
        } catch (Exception e) {
            logger.error("更新索引设置失败", e);
            response.put("success", false);
            response.put("message", "更新失败: " + e.getMessage());
        }
        return response;
    }

    public Map<String, Object> resetToDefaultConfig() {
        Map<String, Object> response = new HashMap<>();
        try {
            for (Map.Entry<String, Object> entry : DEFAULT_CONFIGS.entrySet()) {
                systemConfigService.saveConfig(entry.getKey(), entry.getValue());
            }
            response.put("success", true);
            response.put("message", "已重置为默认配置");
        } catch (Exception e) {
            logger.error("重置默认配置失败", e);
            response.put("success", false);
            response.put("message", "重置失败: " + e.getMessage());
        }
        return response;
    }

    public Map<String, Object> getEffectiveConfig() {
        Map<String, Object> response = new HashMap<>();
        try {
            Map<String, Object> effectiveConfig = new HashMap<>();
            
            // 获取所有配置项的当前值
            for (String key : DEFAULT_CONFIGS.keySet()) {
                Object defaultValue = DEFAULT_CONFIGS.get(key);
                if (defaultValue instanceof Boolean) {
                    effectiveConfig.put(key, systemConfigService.getBooleanValue(key, (Boolean)defaultValue));
                } else if (defaultValue instanceof String) {
                    effectiveConfig.put(key, systemConfigService.getValue(key, (String)defaultValue));
                }
            }
            
            response.put("success", true);
            response.put("config", effectiveConfig);
        } catch (Exception e) {
            logger.error("获取当前配置失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    public Map<String, Object> getCurrentIndexSettings() {
        Map<String, Object> response = new HashMap<>();
        try {
            Map<String, Object> fileTypes = new HashMap<>();
            
            // 获取基础文件类型配置
            fileTypes.put("text", systemConfigService.getBooleanValue("filetype.text.enabled", true));
            fileTypes.put("spreadsheet", systemConfigService.getBooleanValue("filetype.spreadsheet.enabled", true));
            fileTypes.put("web", systemConfigService.getBooleanValue("filetype.web.enabled", true));
            fileTypes.put("code", systemConfigService.getBooleanValue("filetype.code.enabled", true));
            fileTypes.put("config", systemConfigService.getBooleanValue("filetype.config.enabled", true));
            fileTypes.put("archive", systemConfigService.getBooleanValue("filetype.archive.enabled", false));

            // 获取增强型文件类型配置
            Map<String, Object> presentationConfig = new HashMap<>();
            presentationConfig.put("enabled", systemConfigService.getBooleanValue("filetype.presentation.enabled", true));
            presentationConfig.put("enhanced", systemConfigService.getBooleanValue(SystemConfigService.CONFIG_PPT_RECOGNITION, false));
            fileTypes.put("presentation", presentationConfig);

            Map<String, Object> pdfConfig = new HashMap<>();
            pdfConfig.put("enabled", systemConfigService.getBooleanValue("filetype.pdf.enabled", true));
            pdfConfig.put("enhanced", systemConfigService.getBooleanValue(SystemConfigService.CONFIG_PDF_RECOGNITION, false));
            fileTypes.put("pdf", pdfConfig);

            Map<String, Object> imageConfig = new HashMap<>();
            imageConfig.put("enabled", systemConfigService.getBooleanValue("filetype.image.enabled", true));
            imageConfig.put("enhanced", systemConfigService.getBooleanValue(SystemConfigService.CONFIG_IMAGE_RECOGNITION, false));
            fileTypes.put("image", imageConfig);

            response.put("fileTypes", fileTypes);
            response.put("ignoredDirectories", Arrays.asList(
                systemConfigService.getValue(SystemConfigService.CONFIG_IGNORED_DIRECTORIES, "")
                    .split("\n")));
            response.put("success", true);
        } catch (Exception e) {
            logger.error("获取索引设置失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    private void processSimpleFileType(Map<String, Object> fileTypes, String typeName) {
        Object value = fileTypes.get(typeName);
        if (value instanceof Boolean) {
            systemConfigService.saveConfig("filetype." + typeName + ".enabled", (Boolean) value);
        }
    }

    private void processEnhancedFileType(Map<String, Object> fileTypes, String typeName) {
        Object value = fileTypes.get(typeName);
        if (value instanceof Map) {
            Map<String, Object> typeConfig = (Map<String, Object>) value;
            boolean enabled = (Boolean) typeConfig.getOrDefault("enabled", false);
            boolean enhanced = (Boolean) typeConfig.getOrDefault("enhanced", false);
            
            // 保存基础启用状态
            systemConfigService.saveConfig("filetype." + typeName + ".enabled", enabled);
            
            // 根据文件类型使用对应的增强配置常量
            switch (typeName) {
                case "image":
                    systemConfigService.saveConfig(SystemConfigService.CONFIG_IMAGE_RECOGNITION, enhanced);
                    break;
                case "pdf":
                    systemConfigService.saveConfig(SystemConfigService.CONFIG_PDF_RECOGNITION, enhanced);
                    break;
                case "presentation":
                    systemConfigService.saveConfig(SystemConfigService.CONFIG_PPT_RECOGNITION, enhanced);
                    break;
            }
        }
    }
}
