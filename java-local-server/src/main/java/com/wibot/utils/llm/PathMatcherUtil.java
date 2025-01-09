package com.wibot.utils.llm;

import java.nio.file.FileSystems;
import java.nio.file.Path;
import java.nio.file.PathMatcher;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class PathMatcherUtil {
    private static final Logger logger = LoggerFactory.getLogger(PathMatcherUtil.class);
    private final List<PathMatcher> matchers = new ArrayList<>();
    private final List<String> globPatterns = new ArrayList<>(); // 存储转换后的glob模式

    public PathMatcherUtil(List<String> patterns) {
        for (String pattern : patterns) {
            String globPattern = convertToGlob(pattern.trim());
            //logger.debug("Converting pattern '{}' to glob pattern '{}'", pattern, globPattern);
            globPatterns.add(globPattern);
            matchers.add(FileSystems.getDefault().getPathMatcher("glob:" + globPattern));
        }
    }

    private String convertToGlob(String pattern) {
        // logger.debug("Starting to convert pattern: {}", pattern);
        pattern = pattern.trim();
        
        // 移除开头和结尾的斜杠
        if (pattern.startsWith("/")) {
            pattern = pattern.substring(1);
        }
        if (pattern.endsWith("/")) {
            pattern = pattern.substring(0, pattern.length() - 1);
        }

        // 获取基本模式
        String basePattern = pattern;
        if (pattern.startsWith("**/")) {
            basePattern = pattern.substring(3);
        }

        // 对于文件扩展名模式（如 *.avi）
        if (basePattern.startsWith("*.")) {
            String filePattern = basePattern; // 直接匹配文件
            String nestedPattern = "**/" + basePattern; // 匹配子目录中的文件
            globPatterns.add(filePattern);
            return nestedPattern;
        }

        // 对于目录模式
        String dirPattern = basePattern;               // 直接匹配目录
        String dirContent = basePattern + "/**";       // 目录下文件
        String nestedPattern = "**/" + basePattern;    // 子目录
        String nestedContent = nestedPattern + "/**";  // 子目录下文件
        
        globPatterns.add(dirPattern);
        globPatterns.add(dirContent);
        globPatterns.add(nestedPattern);
        globPatterns.add(nestedContent);

        return nestedPattern;
    }

    public boolean matches(Path path) {
        // logger.debug("Trying to match path: {}", path);
        String pathString = path.toString().replace('\\', '/');
        // logger.debug("Normalized path: {}", pathString);
        
        // 移除开头的斜杠以确保正确匹配
        if (pathString.startsWith("/")) {
            pathString = pathString.substring(1);
        }
        
        Path normalizedPath = Path.of(pathString);
        for (String pattern : globPatterns) {
            PathMatcher matcher = FileSystems.getDefault().getPathMatcher("glob:" + pattern);
            boolean matches = matcher.matches(normalizedPath);
            // logger.debug("Pattern '{}' {} path '{}'", 
            //     pattern, 
            //     matches ? "matches" : "does not match",
            //     pathString);
            if (matches) {
                return true;
            }
        }
        return false;
    }
}