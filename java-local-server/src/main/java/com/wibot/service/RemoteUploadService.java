package com.wibot.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.boot.autoconfigure.web.ServerProperties;
import java.nio.file.*;
import java.net.*;
import java.util.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class RemoteUploadService {
    private static final Logger logger = LoggerFactory.getLogger(RemoteUploadService.class);

    @Autowired
    private SystemConfigService systemConfigService;

    @Autowired
    private ServerProperties serverProperties;

    @Autowired
    private DirectoryManagementService directoryManagementService;

    public Map<String, Object> toggleRemoteUpload(boolean enable) {
        Map<String, Object> response = new HashMap<>();
        try {
            systemConfigService.saveConfig(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED, enable);

            if (enable) {
                String currentPath = System.getProperty("user.dir");
                Path remoteFilePath = Paths.get(currentPath, "remoteFile");

                if (!Files.exists(remoteFilePath)) {
                    Files.createDirectories(remoteFilePath);
                }

                String absolutePath = remoteFilePath.toAbsolutePath().toString();
                directoryManagementService.handlePathSubmission(absolutePath);

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

    public Map<String, Object> getRemoteUploadStatus() {
        Map<String, Object> response = new HashMap<>();
        try {
            boolean enabled = systemConfigService.getBooleanValue(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED, false);
            response.put("success", true);
            response.put("enabled", enabled);
        } catch (Exception e) {
            logger.error("获取远程上传状态失败", e);
            response.put("success", false);
            response.put("message", "获取失败: " + e.getMessage());
        }
        return response;
    }

    public Map<String, Object> handleFileUpload(MultipartFile file,String relativePath) {
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

    public Map<String, Object> getUploadConfig() {
        Map<String, Object> response = new HashMap<>();
        try {
            String currentPath = System.getProperty("user.dir");
            Path remoteFilePath = Paths.get(currentPath, "remoteFile");
            InetAddress localHostAddress = getLocalHostAddress();
            int port = serverProperties.getPort() != null ? serverProperties.getPort() : 8080;

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

    public boolean isUploadEnabled() {
        return systemConfigService.getBooleanValue(SystemConfigService.CONFIG_REMOTE_UPLOAD_ENABLED, false);
    }

    private InetAddress getLocalHostAddress() throws SocketException, UnknownHostException {
        Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
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
        return InetAddress.getLocalHost();
    }
}
