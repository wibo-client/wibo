package com.wibot.utils;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.Path;
import java.util.Arrays;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import com.wibot.utils.llm.PathMatcherUtil;

public class PathMatcherUtilTest {
    private PathMatcherUtil matcher;

    @BeforeEach
    void setUp() {
        // 使用标准的 gitignore 格式模式
        matcher = new PathMatcherUtil(Arrays.asList(
            "**/.idea/",      // IDE目录 - 任意层级下的.idea目录
            "**/target/",     // 构建输出 - 任意层级下的target目录
            "**/*.avi",       // 视频文件 - 任意层级下的.avi文件
            "*.log",          // 基础日志文件
            "app.log.*",      // 所有滚动日志文件
            "app.log.[0-9]*", // 带数字的滚动日志
            "app.log.20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*" // 带日期的滚动日志
        ));
    }

    @Test
    void testIdeaDirectoryPatterns() {
        // 测试 .idea 目录匹配
        assertTrue(matcher.matches(Path.of(".idea")), "根目录下的.idea应该匹配");
        assertTrue(matcher.matches(Path.of("project/.idea")), "子目录下的.idea应该匹配");
        assertTrue(matcher.matches(Path.of("deep/nested/project/.idea")), "深层嵌套目录下的.idea应该匹配");
        assertTrue(matcher.matches(Path.of(".idea/workspace.xml")), ".idea目录下的文件应该匹配");
        assertTrue(matcher.matches(Path.of("/user/login/project/.idea/workspace.xml")), ".idea目录下的文件应该匹配");
       
        // 反例
        assertFalse(matcher.matches(Path.of("my.idea")), "不应匹配含.idea的文件名");
        assertFalse(matcher.matches(Path.of("folder.idea/file")), "不应匹配含.idea的目录名");
    }

    @Test
    void testTargetDirectoryPatterns() {
        // 测试 target 目录匹配
        assertTrue(matcher.matches(Path.of("target")), "根目录下的target应该匹配");
        assertTrue(matcher.matches(Path.of("module/target")), "模块下的target应该匹配");
        assertTrue(matcher.matches(Path.of("deep/nested/project/target")), "深层嵌套目录下的target应该匹配");
        assertTrue(matcher.matches(Path.of("target/classes/com/example/Main.class")), "target目录下的文件应该匹配");
        
        // 反例
        assertFalse(matcher.matches(Path.of("mytarget")), "不应匹配含target的文件名");
        assertFalse(matcher.matches(Path.of("targetfolder/file")), "不应匹配含target的目录名");
    }

    @Test
    void testAviFilePatterns() {
        // 测试 .avi 文件匹配
        assertTrue(matcher.matches(Path.of("video.avi")), "根目录下的.avi文件应该匹配");
        assertTrue(matcher.matches(Path.of("videos/movie.avi")), "子目录下的.avi文件应该匹配");
        assertTrue(matcher.matches(Path.of("path/to/deep/nested/file.avi")), "深层嵌套目录下的.avi文件应该匹配");
        
        // 反例
        assertFalse(matcher.matches(Path.of("avi.txt")), "不应匹配以avi为前缀的其他文件");
        assertFalse(matcher.matches(Path.of("video.avi.mp4")), "不应匹配以.avi为中间名的文件");
        assertFalse(matcher.matches(Path.of("fake.avii")), "不应匹配类似后缀的文件");
    }

    @Test
    void testLogFilePatterns() {
        // 基础日志文件匹配
        assertTrue(matcher.matches(Path.of("server.log")), "基础日志文件应该匹配");
        assertTrue(matcher.matches(Path.of("app.log")), "基础日志文件应该匹配");
        
        // 滚动日志文件匹配
        assertTrue(matcher.matches(Path.of("app.log.1")), "数字后缀的滚动日志应该匹配");
        assertTrue(matcher.matches(Path.of("app.log.2023-12-31")), "日期后缀的滚动日志应该匹配");
        assertTrue(matcher.matches(Path.of("app.log.2024-01-09")), "日期后缀的滚动日志应该匹配");
        assertTrue(matcher.matches(Path.of("app.log.backup")), "带后缀的滚动日志应该匹配");
        
        // 特定格式的日期日志
        assertTrue(matcher.matches(Path.of("app.log.2024-01-09.1")), "带日期和序号的日志应该匹配");
        assertTrue(matcher.matches(Path.of("app.log.2024-01-09.gz")), "压缩的日期日志应该匹配");
        
        // 反例测试
        assertFalse(matcher.matches(Path.of("myapp.log.2024")), "不完整的日期格式不应匹配");
        assertFalse(matcher.matches(Path.of("test.log.txt")), "非日志文件不应匹配");
        assertFalse(matcher.matches(Path.of("app.login")), "类似后缀名不应匹配");
        assertFalse(matcher.matches(Path.of("log/app.txt")), "非日志目录下的文件不应匹配");
    }
}
