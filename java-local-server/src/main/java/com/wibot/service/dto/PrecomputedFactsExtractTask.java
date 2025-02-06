package com.wibot.service.dto;

import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;

import com.wibot.persistence.entity.RefineryTaskDO;
import com.wibot.service.RefineryService;

public class PrecomputedFactsExtractTask implements Callable<BatchProcessResult> {
    private final List<Map<String, Object>> batch;
    private final String question;
    private final RefineryTaskDO task;
    private final int batchIndex;
    private final RefineryService service;

    public PrecomputedFactsExtractTask(List<Map<String, Object>> batch, String question, RefineryTaskDO task,
            int batchIndex,
            RefineryService service) {
        this.batch = batch;
        this.question = question;
        this.task = task;
        this.batchIndex = batchIndex;
        this.service = service;
    }

    @Override
    public BatchProcessResult call() {
        BatchProcessResult batchProcessResult = service.processBatchAndGetTokenCost(batch, question, task.getId(),
                batchIndex);
        return batchProcessResult;
    }
}