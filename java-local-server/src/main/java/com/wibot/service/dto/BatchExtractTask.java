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

    public BatchExtractTask(List<Map<String, Object>> batch, String question, int batchIndex,
            RefineryService service) {
        this.batch = batch;
        this.question = question;
        this.batchIndex = batchIndex;
        this.service = service;
    }

    @Override
    public ExtractFactsResult call() throws Exception {
        try {
            // 直接调用抽取方法，不进行存储
            ExtractFactsResult result = service.extractFactsFromContent(batch, question);
            return result;
        } catch (Exception e) {
            throw new RuntimeException("Failed to extract facts for batch " + batchIndex, e);
        }
    }
}
