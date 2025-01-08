package com.wibot.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class ApiKeyService {
    private static final Logger logger = LoggerFactory.getLogger(ApiKeyService.class);

    @Autowired
    private SystemConfigService systemConfigService;

    public Map<String, Object> saveAK(String ak) {
        Map<String, Object> response = new HashMap<>();
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
}
