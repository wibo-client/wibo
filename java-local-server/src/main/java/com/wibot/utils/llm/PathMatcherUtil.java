package com.wibot.utils.llm;

import java.nio.file.FileSystems;
import java.nio.file.Path;
import java.nio.file.PathMatcher;
import java.util.ArrayList;
import java.util.List;

public class PathMatcherUtil {
    private final List<PathMatcher> matchers = new ArrayList<>();

    public PathMatcherUtil(List<String> patterns) {
        for (String pattern : patterns) {
            // 转换 gitignore 样式的模式为 glob 模式
            String globPattern = convertToGlob(pattern.trim());
            matchers.add(FileSystems.getDefault().getPathMatcher("glob:" + globPattern));
        }
    }

    private String convertToGlob(String pattern) {
        if (pattern.startsWith("/")) {
            pattern = pattern.substring(1);
        }
        if (!pattern.startsWith("*") && !pattern.startsWith("/")) {
            pattern = "**/" + pattern;
        }
        return pattern;
    }

    public boolean matches(Path path) {
        for (PathMatcher matcher : matchers) {
            if (matcher.matches(path)) {
                return true;
            }
        }
        return false;
    }
}