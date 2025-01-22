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

import java.util.Map;

@RestController
@RequestMapping("/admin/refinery")
public class RefineryController {
    private static final Logger logger = LoggerFactory.getLogger(RefineryController.class);

    @Autowired
    private RefineryService refineryService;

    @GetMapping("/tasks")
    public Map<String, Object> getAllTasks() {
        // 获取所有精炼任务
        return null;
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
        // 执行全量更新
        return null;
    }

    @PostMapping("/task/{taskId}/update-incremental")
    public Map<String, Object> updateTaskIncremental(@PathVariable String taskId) {
        // 执行增量更新
        return null;
    }

    @PostMapping("/task/{taskId}/delete")
    public Map<String, Object> deleteTask(@PathVariable String taskId) {
        // 删除任务
        return null;
    }

    @GetMapping("/task/{taskId}/status")
    public Map<String, Object> getTaskStatus(@PathVariable String taskId) {
        // 获取任务状态
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
