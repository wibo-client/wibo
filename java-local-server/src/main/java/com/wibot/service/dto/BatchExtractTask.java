package com.wibot.service.dto;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

import com.wibot.service.RefineryService;
import com.wibot.service.RefineryService.ExtractFactsResult;

public class BatchExtractTask implements Callable<ExtractFactsResult> {
    private final List<Map<String, Object>> batch;
    private final String question;
    private final int batchIndex;
    private final RefineryService service;
    private final CollectFactsTask task;

    public BatchExtractTask(List<Map<String, Object>> batch, String question, int batchIndex,
            RefineryService service, CollectFactsTask task) {
        this.batch = batch;
        this.question = question;
        this.batchIndex = batchIndex;
        this.service = service;
        this.task = task;

    }

    @Override
    public ExtractFactsResult call() throws Exception {
        try {
            if (task.getStatus().equals(CollectFactsTask.STATUS_CANCELLED)) {
                return null;
            }
            // 直接调用抽取方法，不进行存储
            ExtractFactsResult result = service.extractFactsFromContent(batch, question);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Failed to extract facts for batch " + batchIndex, e);
        }
    }
}
