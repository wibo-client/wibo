package com.wibot.controller;

import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import com.wibot.service.RefineryService;
import com.wibot.controller.vo.RefineryTaskVO;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/refinery")
public class RefineryController {
    private static final Logger logger = LoggerFactory.getLogger(RefineryController.class);

    @Autowired
    private RefineryService refineryService;

    @GetMapping("/tasks")
    public Map<String, Object> getAllTasks() {
        Map<String, Object> response = new HashMap<>();
        try {
            List<RefineryTaskVO> tasks = refineryService.getAllTasks();
            response.put("success", true);
            response.put("data", tasks);
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
            logger.error("获取精炼任务列表失败", e);
        }
        return response;
    }

    @PostMapping("/task")
    public Map<String, Object> createTask(@RequestBody RefineryTaskVO taskInfo) {
        Map<String, Object> response = new HashMap<>();
        try {
            RefineryTaskVO createdTask = refineryService.createTask(taskInfo);
            response.put("success", true);
            response.put("data", createdTask);
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
            logger.error("创建精炼任务失败", e);
        }
        return response;
    }

    @PostMapping("/task/{taskId}/update-full")
    public Map<String, Object> updateTaskFull(@PathVariable String taskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            Long id = Long.parseLong(taskId);
            refineryService.updateTaskFull(id);
            response.put("success", true);
            response.put("message", "Task update initiated successfully");
        } catch (NumberFormatException e) {
            response.put("success", false);
            response.put("error", "Invalid task ID format");
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
        }
        return response;
    }

    @PostMapping("/task/{taskId}/delete")
    public Map<String, Object> deleteTask(@PathVariable String taskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            Long id = Long.parseLong(taskId);
            refineryService.deleteTask(id);
            response.put("success", true);
            response.put("message", "Task deleted successfully");
        } catch (NumberFormatException e) {
            response.put("success", false);
            response.put("error", "Invalid task ID format");
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
        }
        return response;
    }

    @GetMapping("/task/{taskId}/status")
    public Map<String, Object> getTaskStatus(@PathVariable String taskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            Long id = Long.parseLong(taskId);
            RefineryTaskVO task = refineryService.getTask(id);
            response.put("success", true);
            response.put("status", task.getStatus());
            response.put("errorMessage", task.getErrorMessage());
            response.put("coveredFileCount", task.getCoveredFileCount());
            response.put("lastUpdateTime", task.getLastUpdateTime());
            response.put("processingCheckpoint", task.getProcessingCheckpoint());
        } catch (NumberFormatException e) {
            response.put("success", false);
            response.put("error", "Invalid task ID format");
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
        }
        return response;
    }

    @PostMapping("/task/{taskId}/update-incremental")
    public Map<String, Object> updateTaskIncremental(@PathVariable String taskId) {
        // 执行增量更新
        return null;
    }

    @GetMapping("/task/{taskId}/progress")
    public Map<String, Object> getTaskProgress(@PathVariable String taskId) {
        Map<String, Object> response = new HashMap<>();
        try {
            RefineryTaskVO task = refineryService.getTask(Long.valueOf(taskId));
            response.put("success", true);
            response.put("status", task.getStatus());
            response.put("checkpoint", task.getProcessingCheckpoint());
            response.put("errorMessage", task.getErrorMessage());
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
        }
        return response;
    }
}
