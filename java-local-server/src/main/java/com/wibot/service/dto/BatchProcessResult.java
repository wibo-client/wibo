package com.wibot.service.dto;

public class BatchProcessResult {
    private final int tokenCost;
    private final Long minId;

    public BatchProcessResult(int tokenCost, Long minId) {
        this.tokenCost = tokenCost;
        this.minId = minId;
    }

    public int getTokenCost() {
        return tokenCost;
    }

    public Long getMinId() {
        return minId;
    }
}