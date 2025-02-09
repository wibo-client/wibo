package com.wibot.service;

import com.wibot.persistence.SystemConfigRepository;
import com.wibot.persistence.entity.SystemConfigPO;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

@Service
public class SystemConfigService {

    public static final String CONFIG_API_KEY = "llm.api.Key";
    public static final String CONFIG_LLM_CONCURRENCY = "llm.concurrency";
    public static final String CONFIG_CHAT_MODEL = "llm.chat.model";
    public static final String CONFIG_OCR_MODEL = "llm.ocr.model";

    public static final String CONFIG_MIN_TEXT_LENGTH = "pdf.minTextLength";
    public static final String CONFIG_PPT_MAX_WIDTH = "ppt.maxWidth";
    public static final String CONFIG_PPT_MAX_HEIGHT = "ppt.maxHeight";
    public static final String CONFIG_PPT_MIN_TEXT_LENGTH = "ppt.minTextLength";
    public static final String CONFIG_PNG_MAX_WIDTH = "png.maxWidth";
    public static final String CONFIG_PNG_MAX_HEIGHT = "png.maxHeight";
    public static final String CONFIG_JPG_MAX_WIDTH = "jpg.maxWidth";
    public static final String CONFIG_JPG_MAX_HEIGHT = "jpg.maxHeight";
    public static final String CONFIG_OCR_MAX_RETRIES = "ocr.max-retries";
    public static final String CONFIG_REMOTE_UPLOAD_ENABLED = "remote.upload.enabled";

    public static final String CONFIG_IMAGE_RECOGNITION = "model.enhancement.imageRecognition";
    public static final String CONFIG_PDF_RECOGNITION = "model.enhancement.pdfRecognition";
    public static final String CONFIG_PPT_RECOGNITION = "model.enhancement.pptRecognition";

    // 文件类型索引配置前缀
    public static final String CONFIG_FILE_TYPE_PREFIX = "filetype.";
    
    // 忽略目录配置
    public static final String CONFIG_IGNORED_DIRECTORIES = "index.ignored.directories";

    private static final Logger logger = LoggerFactory.getLogger(SystemConfigService.class);

    @Autowired
    private SystemConfigRepository configRepository;

    @Autowired
    private ObjectMapper objectMapper;

    // 缓存相关字段
    private final Map<String, CacheEntry> configCache = new HashMap<>();
    private long lastClearTime = System.currentTimeMillis();
    private static final long CACHE_CLEAR_INTERVAL = 30000; // 30秒

    private static class CacheEntry {
        final Object value;
        final long timestamp;

        CacheEntry(Object value) {
            this.value = value;
            this.timestamp = System.currentTimeMillis();
        }
    }

    private void checkAndClearCache() {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastClearTime > CACHE_CLEAR_INTERVAL) {
            configCache.clear();
            lastClearTime = currentTime;
            logger.debug("Config cache cleared at: {}", lastClearTime);
        }
    }

    /**
     * 保存配置并清除缓存
     * 
     * @param key   配置键
     * @param value 配置值(任意对象，将被转换为JSON)
     */
    @Transactional
    public void saveConfig(String key, Object value) {
        try {
            // 先查询是否存在
            Optional<SystemConfigPO> existingConfig = configRepository.findByConfigKey(key);
            
            if (existingConfig.isPresent()) {
                // 如果存在，更新现有记录
                SystemConfigPO config = existingConfig.get();
                config.setConfigValue(String.valueOf(value));
                config.setUpdatedAt(LocalDateTime.now());
                configRepository.save(config);
            } else {
                // 如果不存在，创建新记录
                SystemConfigPO config = new SystemConfigPO();
                config.setConfigKey(key);
                config.setConfigValue(String.valueOf(value));
                config.setCreatedAt(LocalDateTime.now());
                config.setUpdatedAt(LocalDateTime.now());
                configRepository.save(config);
            }
            
            // 保存时清除所有缓存
            configCache.clear();
            lastClearTime = System.currentTimeMillis();
        } catch (Exception e) {
            throw new RuntimeException("保存配置失败: " + key, e);
        }
    }

    /**
     * 读取配置(带缓存)
     * 
     * @param key          配置键
     * @param clazz        配置值类型
     * @param defaultValue 默认值
     * @return 配置值对象
     */
    public <T> T getConfig(String key, Class<T> clazz, T defaultValue) {
        checkAndClearCache();
        
        String cacheKey = key + "_" + clazz.getName();
        CacheEntry entry = configCache.get(cacheKey);
        
        if (entry != null) {
            @SuppressWarnings("unchecked")
            T cachedValue = (T) entry.value;
            return cachedValue;
        }

        Optional<SystemConfigPO> config = configRepository.findByConfigKey(key);
        if (config.isPresent()) {
            try {
                String configValue = config.get().getConfigValue();
                T value;
                
                // 如果是String类型，直接返回
                if (clazz == String.class) {
                    @SuppressWarnings("unchecked")
                    T stringValue = (T) configValue;
                    value = stringValue;
                } else {
                    // 对于非String类型，尝试JSON解析
                    try {
                        value = objectMapper.readValue(configValue, clazz);
                    } catch (JsonProcessingException e) {
                        // 如果JSON解析失败，尝试直接转换
                        value = convertValue(configValue, clazz);
                    }
                }
                
                configCache.put(cacheKey, new CacheEntry(value));
                return value;
            } catch (Exception e) {
                logger.error("Error reading config: {} ", key, e);
                return defaultValue;
            }
        }
        return defaultValue;
    }

    /**
     * 转换简单类型的值
     */
    @SuppressWarnings("unchecked")
    private <T> T convertValue(String value, Class<T> clazz) {
        if (clazz == Boolean.class) {
            return (T) Boolean.valueOf(value);
        } else if (clazz == Integer.class) {
            return (T) Integer.valueOf(value);
        } else if (clazz == Long.class) {
            return (T) Long.valueOf(value);
        } else if (clazz == Double.class) {
            return (T) Double.valueOf(value);
        } else if (clazz == Float.class) {
            return (T) Float.valueOf(value);
        }
        throw new IllegalArgumentException("Unsupported type conversion for: " + clazz);
    }

    /**
     * 读取配置
     * 
     * @param key   配置键
     * @param clazz 配置值类型
     * @return 配置值对象
     */
    public <T> T getConfig(String key, Class<T> clazz) {
        return getConfig(key, clazz, null);
    }

    /**
     * 获取字符串类型配置值
     * 
     * @param key          配置键
     * @param defaultValue 默认值
     * @return 字符串类型的配置值
     */
    public String getValue(String key, String defaultValue) {
        return getConfig(key, String.class, defaultValue);
    }

    /**
     * 获取整数类型配置值
     * 
     * @param key          配置键
     * @param defaultValue 默认值
     * @return 整数类型的配置值
     */
    public int getIntValue(String key, int defaultValue) {
        return getConfig(key, Integer.class, defaultValue);
    }

    /**
     * 获取布尔类型配置值
     * 
     * @param key          配置键
     * @param defaultValue 默认值
     * @return 布尔类型的配置值
     */
    public boolean getBooleanValue(String key, boolean defaultValue) {
        return getConfig(key, Boolean.class, defaultValue);
    }

    // /**
    //  * 删除配置
    //  * 
    //  * @param key 配置键
    //  */
    // public void deleteConfig(String key) {
    //     configRepository.deleteByConfigKey(key);
    // }

    /**
     * 获取所有配置
     * 
     * @return 配置Map
     */
    public Map<String, Object> getAllConfigs() {
        Map<String, Object> configs = new HashMap<>();
        configRepository.findAll().forEach(config -> {
            try {
                Object value = objectMapper.readValue(config.getConfigValue(), Object.class);
                configs.put(config.getConfigKey(), value);
            } catch (JsonProcessingException e) {
                logger.error("Error reading config: {} ", config.getConfigKey(), e);
            }
        });
        return configs;
    }

    /**
     * 检查配置是否存在
     * 
     * @param key 配置键
     * @return 如果配置存在返回true，否则返回false
     */
    public boolean hasConfig(String key) {
        Optional<SystemConfigPO> config = configRepository.findByConfigKey(key);
        return config.isPresent() && config.get().getConfigValue() != null;
    }
}
