package com.wibot.service.dto;

import java.util.concurrent.Future;

public class TaskContext {
    final CollectFactsTask task;
    final Future<?> future;

    public TaskContext(CollectFactsTask task, Future<?> future) {
        this.task = task;
        this.future = future;
    }

    public CollectFactsTask getTask() {
        return task;
    }

    public Future<?> getFuture() {
        return future;
    }
}