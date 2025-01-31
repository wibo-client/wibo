package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.persistence.RefineryFactRepository;
import com.wibot.persistence.RefineryTaskRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import com.wibot.persistence.entity.RefineryFactDO;
import com.wibot.persistence.entity.RefineryTaskDO;
import com.wibot.service.dto.ExtractFactResponse;
import com.wibot.service.dto.ExtractedFact;
import com.wibot.utils.JsonExtractor;

import jakarta.annotation.PreDestroy;

import com.wibot.controller.vo.RefineryTaskVO;
import com.wibot.documentLoader.DocumentIndexService;
import com.wibot.documentLoader.event.DocumentEventListener;
import com.wibot.documentLoader.event.DocumentProcessEvent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;

import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class RefineryService implements DocumentEventListener {
    private static final Logger logger = LoggerFactory.getLogger(RefineryService.class);
    private static final int MAX_CONTENT_SIZE = 28720;
    private static final String UPDATE_TYPE_INCREMENTAL = "INCREMENTAL";
    private static final String UPDATE_TYPE_FULL = "FULL";

    @Value("classpath:/prompts/extractFacts.st")
    private Resource extractFactsPrompt;

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    @Autowired
    private RefineryTaskRepository refineryTaskRepository;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @Autowired
    private MarkdownParagraphRepository markdownParagraphRepository;

    @Autowired
    private RefineryFactRepository refineryFactRepository;

    @Autowired
    private DocumentIndexService documentIndexService;

    @Autowired
    private ObjectMapper objectMapper; // 替换原有的 private final ObjectMapper objectMapper = new ObjectMapper();

    // 替换原有的线程池定义
    private final ExecutorService batchProcessor = new ThreadPoolExecutor(
            3, // 核心线程数
            3, // 最大线程数
            60L, // 空闲线程存活时间
            TimeUnit.SECONDS, // 时间单位
            new ArrayBlockingQueue<>(200), // 队列大小为200
            new ThreadFactory() {
                private final AtomicInteger threadNumber = new AtomicInteger(1);

                @Override
                public Thread newThread(Runnable r) {
                    Thread thread = new Thread(r);
                    thread.setName("RefineryService-Worker-" + threadNumber.getAndIncrement());
                    thread.setDaemon(false);
                    return thread;
                }
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public RefineryTaskVO createTask(RefineryTaskVO taskVO) {
        // 检查是否已存在相同的任务
        Optional<RefineryTaskDO> existingTask = refineryTaskRepository
                .findAll()
                .stream()
                .filter(task -> task.getDirectoryPath().equals(taskVO.getDirectoryPath())
                        && task.getKeyQuestion().equals(taskVO.getKeyQuestion()))
                .findFirst();

        if (existingTask.isPresent()) {
            RefineryTaskVO existingVO = convertToVO(existingTask.get());
            existingVO.setMessage("任务已存在，请勿重复创建");
            return existingVO;
        }

        // 转换VO到DO
        RefineryTaskDO taskDO = new RefineryTaskDO();
        taskDO.setDirectoryPath(taskVO.getDirectoryPath());
        taskDO.setKeyQuestion(taskVO.getKeyQuestion());

        // 设置初始值
        taskDO.setCoveredFileCount(0);
        taskDO.setFullUpdateTokenCost(0);
        taskDO.setIncrementalTokenCost(0);
        taskDO.setHitCount(0);
        taskDO.setCreateTime(LocalDateTime.now());
        taskDO.setLastUpdateTime(LocalDateTime.now());
        taskDO.setStatus(RefineryTaskDO.STATUS_PENDING);

        // 保存到数据库
        RefineryTaskDO savedTask = refineryTaskRepository.save(taskDO);

        // 转换回VO
        return convertToVO(savedTask);
    }

    public RefineryTaskVO getTask(Long taskId) {
        return refineryTaskRepository.findById(taskId)
                .map(this::convertToVO)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
    }

    public List<RefineryTaskVO> getAllTasks() {
        return refineryTaskRepository.findAll().stream()
                .map(this::convertToVO)
                .collect(Collectors.toList());
    }

    @Scheduled(fixedDelay = 60000) // 每分钟执行一次,为了简化，这个任务是单线程的，以后再看看要不要改多线程，短期就单线程做分发，节省同步难度。
    public synchronized void processScheduledTasks() {
        logger.info("Starting scheduled task processing");

        // 正常查询逻辑
        List<RefineryTaskDO> tasksToProcess = refineryTaskRepository
                .findByStatusIn(Arrays.asList(RefineryTaskDO.STATUS_PENDING, RefineryTaskDO.STATUS_PROCESSING,
                        RefineryTaskDO.STATUS_FAILED));
        logger.info("Found {} pending tasks", tasksToProcess.size());

        for (RefineryTaskDO task : tasksToProcess) {
            try {
                // 2. 检查是否需要执行（根据更新周期）

                // 3. 更新状态为处理中
                task.setStatus(RefineryTaskDO.STATUS_PROCESSING);
                task.setLastUpdateTime(LocalDateTime.now());
                refineryTaskRepository.save(task);

                // 4. 处理任务
                processTask(task);

                // 5. 更新状态为活跃
                task.setStatus(RefineryTaskDO.STATUS_ACTIVE);
                task.setErrorMessage(null);
                task.setProcessingCheckpoint(null);
                refineryTaskRepository.save(task);

            } catch (Exception e) {
                logger.error("Error processing task: " + task.getId(), e);
                // 6. 更新失败状态和错误信息
                task.setStatus(RefineryTaskDO.STATUS_FAILED);
                task.setErrorMessage(e.getMessage());
                refineryTaskRepository.save(task);
            }
        }
    }

    private void processTask(RefineryTaskDO task) {
        String checkpoint = task.getProcessingCheckpoint();
        try {
            // 统计文件数
            long coveredFileCount = documentDataRepository.countByFilePathStartingWith(task.getDirectoryPath());
            task.setCoveredFileCount((int) coveredFileCount);

            List<MarkdownParagraphPO> paragraphs = getSortedParagraphIds(task.getDirectoryPath());

            // 如果有断点，过滤出断点之后的段落
            if (checkpoint != null && !checkpoint.isEmpty()) {
                Long checkpointId = Long.parseLong(checkpoint);
                paragraphs = paragraphs.stream()
                        .filter(p -> p.getId() > checkpointId)
                        .toList();
            }

            // 获取所有任务的Future
            List<Future<BatchProcessResult>> futures = extractFactsFromParagraph(paragraphs, task.getKeyQuestion(),
                    task);

            // 逐个处理future结果
            for (Future<BatchProcessResult> future : futures) {
                try {
                    BatchProcessResult result = future.get();
                    updateTaskStats(task.getId(), result.getTokenCost(),
                            result.getMinId(), UPDATE_TYPE_FULL);
                } catch (Exception e) {
                    logger.error("Error processing future result: {}", e.getMessage());
                    throw new RuntimeException("Failed to process task future", e);
                }
            }

            // 任务完成后清除checkpoint
            clearTaskCheckpoint(task.getId());

        } catch (Exception e) {
            throw new RuntimeException("Task processing failed: " + e.getMessage(), e);
        }
    }

    private List<Future<BatchProcessResult>> extractFactsFromParagraph(List<MarkdownParagraphPO> paragraphs,
            String question, RefineryTaskDO task) {
        List<Future<BatchProcessResult>> futures = new ArrayList<>();
        int batchIndex = 1;

        // 只创建和提交任务,不等待结果
        for (MarkdownParagraphPO paragraph : paragraphs) {
            Map<String, Object> reference = new HashMap<>();
            reference.put("part", "第" + batchIndex + "篇参考内容");
            reference.put("id", paragraph.getId());
            reference.put("content", paragraph.getContent());
            reference.put("paragraphOrder", paragraph.getParagraphOrder());
            reference.put("date", paragraph.getCreatedDateTime());

            try {
                String jsonStr = objectMapper.writeValueAsString(reference);
                List<Map<String, Object>> singleItemBatch = Collections.singletonList(reference);

                Future<BatchProcessResult> future = submitTask(
                        new BatchProcessTask(singleItemBatch, question, task, batchIndex, this));
                futures.add(future);

                batchIndex++;
            } catch (JsonProcessingException e) {
                logger.error("Failed to serialize reference to JSON", e);
                throw new RuntimeException(e);
            }
        }

        return futures;
    }

    private void updateTaskWithRetry(Long taskId, int responseLength, Long paragraphId, String response) {
        int maxRetries = 3;
        int retryCount = 0;
        boolean success = false;

        while (!success && retryCount < maxRetries) {
            try {
                RefineryTaskDO task = refineryTaskRepository.findById(taskId)
                        .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

                // 更新task信息
                task.setFullUpdateTokenCost(task.getFullUpdateTokenCost() + responseLength);
                task.setProcessingCheckpoint(paragraphId.toString());

                // 构建索引
                documentIndexService.buildRefineryTaskIndex(taskId, response, paragraphId);

                success = true;

            } catch (Exception e) {
                retryCount++;
                if (retryCount == maxRetries) {
                    logger.error("Failed to update task after {} retries for taskId: {}", maxRetries, taskId, e);
                    throw new RuntimeException("Failed to update task after " + maxRetries + " retries", e);
                }
                logger.warn("Retry {} - Failed to update task: {}, will retry in 1 second", retryCount, taskId);
                try {
                    Thread.sleep(1000);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new RuntimeException("Task update interrupted", ie);
                }
            }
        }
    }

    /**
     * 用于封装LLM调用结果的类
     */
    public static class ExtractFactsResult {
        private final List<ExtractedFact> facts;
        private final String rawResponse;
        private final int responseLength;

        public ExtractFactsResult(List<ExtractedFact> facts, String rawResponse) {
            this.facts = facts;
            this.rawResponse = rawResponse;
            this.responseLength = rawResponse != null ? rawResponse.length() : 0;
        }

        public List<ExtractedFact> getFacts() {
            return facts;
        }

        public String getRawResponse() {
            return rawResponse;
        }

        public int getResponseLength() {
            return responseLength;
        }
    }

    /**
     * 公共方法：从内容中提取事实
     */
    public ExtractFactsResult extractFactsFromContent(List<Map<String, Object>> batch, String question) {
        Map<String, Object> params = new HashMap<>();
        try {
            String jsonInput = objectMapper.writeValueAsString(batch);
            params.put("references", jsonInput);
            params.put("question", question);

            PromptTemplate promptTemplate = new PromptTemplate(extractFactsPrompt);
            Message userMessage = promptTemplate.createMessage(params);
            Prompt prompt = new Prompt(Collections.singletonList(userMessage));

            for (int attempt = 0; attempt < 3; attempt++) {
                try {
                    String response = singletonLLMChat.getChatClient()
                            .prompt(prompt)
                            .call()
                            .content();

                    String jsonStr = JsonExtractor.extractJsonFromResponse(response);
                    if (jsonStr == null) {
                        logger.error("Failed to extract JSON from response: {}", response);
                        continue;
                    }

                    ExtractFactResponse factResponse = objectMapper.readValue(jsonStr, ExtractFactResponse.class);
                    if (factResponse != null && factResponse.getFacts() != null) {
                        return new ExtractFactsResult(factResponse.getFacts(), response);
                    }
                } catch (Exception e) {
                    if (attempt == 2) {
                        throw e;
                    }
                    logger.warn("Attempt {} failed, retrying in {} seconds", attempt + 1, attempt + 1);
                    Thread.sleep(1000 * (attempt + 1));
                }
            }
        } catch (Exception e) {
            logger.error("Error extracting facts: {}", e.getMessage());
            throw new RuntimeException("Failed to extract facts ， already retry 3 times  ", e);
        }
        return new ExtractFactsResult(Collections.emptyList(), null);
    }

    /**
     * 修改后的处理方法，使用新的公共方法
     */
    public int processBatchAndGetTokenCost(List<Map<String, Object>> batch, String question,
            Long taskId, int batchIndex) {
        try {
            ExtractFactsResult result = extractFactsFromContent(batch, question);
            if (result.getFacts().isEmpty()) {
                return 0;
            }

            boolean isFirst = true;
            for (ExtractedFact fact : result.getFacts()) {
                Long paragraphId = Long.parseLong(fact.getId());
                if (isFirst) {
                    logger.info("Extracted facts: {}", result.getFacts());
                    isFirst = false;
                    refineryFactRepository.deleteByRefineryTaskIdAndParagraphId(taskId, paragraphId);
                }

                saveFact(taskId, paragraphId, fact.getFact());
            }

            logger.info("Successfully processed and saved batch {}, extracted {} facts",
                    batchIndex, result.getFacts().size());

            // 获取当前批次的段落ID
            Long paragraphId = Long.parseLong(batch.get(0).get("id").toString());

            // 更新任务状态
            updateTaskWithRetry(taskId, result.getResponseLength(), paragraphId, result.getRawResponse());

            return result.getResponseLength();

        } catch (Exception e) {
            logger.error("Error processing batch {}", batchIndex, e);
            throw new RuntimeException("Failed to process batch " + batchIndex, e);
        }
    }

    private void saveFact(Long taskId, Long paragraphId, String factContent) {
        Optional<RefineryFactDO> existingFact = refineryFactRepository
                .findByRefineryTaskIdAndParagraphId(taskId, paragraphId)
                .stream()
                .findFirst();

        if (existingFact.isPresent()) {
            RefineryFactDO factDO = existingFact.get();
            factDO.setFact(factDO.getFact() + "\n" + factContent);
            refineryFactRepository.save(factDO);
        } else {
            RefineryFactDO factDO = new RefineryFactDO(taskId, paragraphId, factContent);
            refineryFactRepository.save(factDO);
        }
    }

    /**
     * 获取指定目录下所有Markdown段落ID的有序列表
     * 
     * @param directoryPath 目录路径
     * @return 已排序的段落ID列表
     */
    private List<MarkdownParagraphPO> getSortedParagraphIds(String directoryPath) {
        List<MarkdownParagraphPO> paragraphs = new ArrayList<>();

        documentDataRepository.findByFilePathStartingWith(directoryPath)
                .forEach(doc -> {
                    markdownParagraphRepository.findByDocumentDataId(doc.getId())
                            .forEach(paragraph -> {
                                paragraphs.add(paragraph);
                            });
                });

        // 排序以方便断点续传
        paragraphs.sort((p1, p2) -> Long.compare(p1.getId(), p2.getId()));

        return paragraphs;
    }

    private RefineryTaskVO convertToVO(RefineryTaskDO taskDO) {
        RefineryTaskVO vo = new RefineryTaskVO();
        vo.setId(taskDO.getId());
        vo.setDirectoryPath(taskDO.getDirectoryPath());
        vo.setKeyQuestion(taskDO.getKeyQuestion());
        vo.setCoveredFileCount(taskDO.getCoveredFileCount());
        vo.setFullUpdateTokenCost(taskDO.getFullUpdateTokenCost());
        vo.setIncrementalTokenCost(taskDO.getIncrementalTokenCost());

        vo.setHitCount(taskDO.getHitCount());
        vo.setLastUpdateTime(taskDO.getLastUpdateTime());
        vo.setCreateTime(taskDO.getCreateTime());
        vo.setStatus(taskDO.getStatus());
        vo.setErrorMessage(taskDO.getErrorMessage());
        vo.setProcessingCheckpoint(taskDO.getProcessingCheckpoint());
        return vo;
    }

    @Override
    public void onDocumentProcessed(DocumentProcessEvent event) {
        try {
            switch (event.getEventType()) {
                case DocumentProcessEvent.TYPE_BEFORE_DELETE:
                    handleBeforeDocumentDelete(event.getDocument());
                    break;
                case DocumentProcessEvent.TYPE_AFTER_MODIFY:
                    handleAfterDocumentModify(event.getDocument());
                    break;
            }
        } catch (Exception e) {
            logger.error("Error handling document event: {}", event.getEventType(), e);
        }
    }

    private void handleBeforeDocumentDelete(DocumentDataPO document) {
        logger.info("Handling document deletion: {}", document.getFilePath());

        // 获取文档相关的所有段落
        List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository.findByDocumentDataId(document.getId());

        // 获取段落ID列表
        List<Long> paragraphIds = paragraphs.stream()
                .map(MarkdownParagraphPO::getId)
                .toList();

        // 删除这些段落相关的所有事实
        if (!paragraphIds.isEmpty()) {
            refineryFactRepository.deleteByParagraphIdIn(paragraphIds);
        }
    }

    private void handleAfterDocumentModify(DocumentDataPO document) {
        logger.info("Handling document modification: {}", document.getFilePath());
        String directoryPathPattern = getParentPath(document.getFilePath()) + "%";
        List<RefineryTaskDO> relatedTasks = refineryTaskRepository.findByDirectoryPathLikeAndStatus(
                directoryPathPattern,
                RefineryTaskDO.STATUS_ACTIVE);

        for (RefineryTaskDO task : relatedTasks) {
            try {
                List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository
                        .findByDocumentDataId(document.getId());

                // 删除旧的事实
                List<Long> paragraphIds = paragraphs.stream()
                        .map(MarkdownParagraphPO::getId)
                        .toList();
                if (!paragraphIds.isEmpty()) {
                    refineryFactRepository.deleteByRefineryTaskIdAndParagraphIdIn(task.getId(), paragraphIds);
                }

                // 获取所有future并等待完成
                List<Future<BatchProcessResult>> futures = extractFactsFromParagraph(paragraphs, task.getKeyQuestion(),
                        task);
                int tokenCost = 0;
                for (Future<BatchProcessResult> future : futures) {
                    BatchProcessResult result = future.get();
                    updateTaskStats(task.getId(), result.getTokenCost(), null, UPDATE_TYPE_INCREMENTAL);
                }

                task.setIncrementalTokenCost(task.getIncrementalTokenCost() + tokenCost);
                task.setLastUpdateTime(LocalDateTime.now());
                refineryTaskRepository.save(task);

            } catch (Exception e) {
                logger.error("Error processing modified document for task {}: {}", task.getId(), e.getMessage());
                task.setStatus(RefineryTaskDO.STATUS_FAILED);
                task.setErrorMessage("Error processing modified document: " + e.getMessage());
                refineryTaskRepository.save(task);
            }
        }
    }

    private String getParentPath(String filePath) {
        // 同时处理 Windows 和 Unix 风格的路径分隔符
        int lastUnixSeparator = filePath.lastIndexOf('/');
        int lastWindowsSeparator = filePath.lastIndexOf('\\');
        int lastColon = filePath.lastIndexOf(':');

        // 获取最后一个分隔符的位置
        int lastSeparator = Math.max(lastUnixSeparator, Math.max(lastWindowsSeparator, lastColon));

        // 如果找不到分隔符或分隔符在开头，返回原路径
        if (lastSeparator <= 0) {
            return filePath;
        }

        // 截取到最后一个分隔符的位置
        return filePath.substring(0, lastSeparator);
    }

    /**
     * 执行任务的全量更新
     */
    public void updateTaskFull(Long taskId) {
        RefineryTaskDO task = refineryTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        // 清除checkpoint，以便重新处理所有内容
        task.setProcessingCheckpoint(null);

        // 将状态设置为待处理
        task.setStatus(RefineryTaskDO.STATUS_PENDING);
        task.setLastUpdateTime(LocalDateTime.now());
        task.setErrorMessage(null);

        refineryTaskRepository.save(task);

        // 删除现有的事实和索引
        refineryFactRepository.deleteByRefineryTaskId(taskId);
        try {
            List<RefineryFactDO> facts = refineryFactRepository.findByRefineryTaskId(taskId);
            for (RefineryFactDO fact : facts) {
                documentIndexService.deleteRefineryTaskIndex(taskId, fact.getParagraphId());
            }
        } catch (Exception e) {
            logger.error("Error cleaning up old indices for task {}", taskId, e);
        }
    }

    /**
     * 删除任务及其相关数据
     */
    public void deleteTask(Long taskId) {
        // 删除事实数据前先清理索引
        try {
            List<RefineryFactDO> facts = refineryFactRepository.findByRefineryTaskId(taskId);
            for (RefineryFactDO fact : facts) {
                documentIndexService.deleteRefineryTaskIndex(taskId, fact.getParagraphId());
            }
        } catch (Exception e) {
            logger.error("Error deleting indices for task {}", taskId, e);
        }

        // 删除数据库中的数据
        refineryFactRepository.deleteByRefineryTaskId(taskId);
        refineryTaskRepository.deleteById(taskId);
    }

    // 添加静态内部类 BatchProcessResult
    private static class BatchProcessResult {
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

    // 添加静态内部类 BatchProcessTask
    private static class BatchProcessTask implements Callable<BatchProcessResult> {
        private final List<Map<String, Object>> batch;
        private final String question;
        private final RefineryTaskDO task;
        private final int batchIndex;
        private final RefineryService service;

        public BatchProcessTask(List<Map<String, Object>> batch, String question, RefineryTaskDO task, int batchIndex,
                RefineryService service) {
            this.batch = batch;
            this.question = question;
            this.task = task;
            this.batchIndex = batchIndex;
            this.service = service;
        }

        @Override
        public BatchProcessResult call() {
            int tokenCost = service.processBatchAndGetTokenCost(batch, question, task.getId(), batchIndex);
            // 由于每个batch只有一个段落，直接返回其ID
            Long paragraphId = Long.valueOf(batch.get(0).get("id").toString());
            return new BatchProcessResult(tokenCost, paragraphId);
        }
    }

    @PreDestroy
    public void cleanup() {
        // 优雅关闭线程池
        batchProcessor.shutdown();
        try {
            if (!batchProcessor.awaitTermination(60, TimeUnit.SECONDS)) {
                batchProcessor.shutdownNow();
            }
        } catch (InterruptedException e) {
            batchProcessor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    // 添加任务提交方法
    public <T> Future<T> submitTask(Callable<T> task) {
        return batchProcessor.submit(task);
    }

    /**
     * 同步更新任务状态
     */
    private synchronized void updateTaskStats(Long taskId, int tokenCost, Long paragraphId, String updateType) {
        RefineryTaskDO task = refineryTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));

        if (UPDATE_TYPE_INCREMENTAL.equals(updateType)) {
            // 增量更新只更新token消耗
            task.setIncrementalTokenCost(task.getIncrementalTokenCost() + tokenCost);
        } else {
            // 全量更新需要更新checkpoint和token消耗
            task.setFullUpdateTokenCost(task.getFullUpdateTokenCost() + tokenCost);
            if (paragraphId != null) {
                task.setProcessingCheckpoint(paragraphId.toString());
            }
        }

        task.setLastUpdateTime(LocalDateTime.now());
        refineryTaskRepository.save(task);
    }

    /**
     * 清除任务的checkpoint
     */
    private synchronized void clearTaskCheckpoint(Long taskId) {
        RefineryTaskDO task = refineryTaskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        task.setProcessingCheckpoint(null);
        task.setLastUpdateTime(LocalDateTime.now());
        refineryTaskRepository.save(task);
    }
}
