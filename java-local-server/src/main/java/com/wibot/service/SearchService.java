package com.wibot.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.wibot.persistence.RefineryFactRepository;
import com.wibot.persistence.RefineryTaskRepository;
import com.wibot.persistence.entity.RefineryFactDO;
import com.wibot.persistence.entity.RefineryTaskDO;
import com.wibot.service.RefineryService.ExtractFactsResult;
import com.wibot.service.dto.BatchExtractTask;
import com.wibot.service.dto.CollectFactsTask;
import com.wibot.service.dto.ExtractedFact;
import com.wibot.service.dto.SearchStrategy;
import com.wibot.service.dto.TaskContext;
import com.wibot.utils.JsonExtractor;

import jakarta.annotation.PreDestroy;

import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.HashMap;
import java.util.HashSet;
import java.io.File;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.LinkedBlockingQueue;

import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.controller.vo.SearchResultVO;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;

@Service
public class SearchService {
    private static final Logger logger = LoggerFactory.getLogger(SearchService.class);

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    @Autowired
    private RefineryTaskRepository refineryTaskRepository;

    @Autowired
    private RefineryFactRepository refineryFactRepository;

    // @Autowired
    // private DocumentIndexInterface documentIndexInterface;

    @Autowired
    private RefineryService refineryService;

    @Autowired
    private ObjectMapper objectMapper;

    @Value("classpath:/prompts/search.st")
    private Resource searchPrompt;

    @Value("classpath:/prompts/findSimilarQuestions.st")
    private Resource findSimilarQuestionsPrompt;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @Autowired
    private MarkdownParagraphRepository markdownParagraphRepository;

    public final int MAX_BATCH_SIZE = 28720;

    private final AtomicLong taskIdGenerator = new AtomicLong(0);
    private final ExecutorService executorService = new ThreadPoolExecutor(
            3, // 核心线程数
            20, // 最大线程数
            60L, // 空闲线程存活时间
            TimeUnit.SECONDS, // 时间单位
            new LinkedBlockingQueue<>(100), // 任务队列，限制队列大小为100
            new ThreadFactory() {
                private final AtomicInteger threadNumber = new AtomicInteger(1);
                @Override
                public Thread newThread(Runnable r) {
                    Thread thread = new Thread(r);
                    thread.setName("SearchService-Worker-" + threadNumber.getAndIncrement());
                    thread.setDaemon(true);
                    return thread;
                }
            },
            new ThreadPoolExecutor.CallerRunsPolicy() // 拒绝策略：当队列满时，在调用者线程中执行任务
    );

    private static final ConcurrentHashMap<Long, TaskContext> taskContexts = new ConcurrentHashMap<>();

    @PreDestroy
    public void cleanup() {
        executorService.shutdown();
        try {
            if (!executorService.awaitTermination(60, TimeUnit.SECONDS)) {
                executorService.shutdownNow();
            }
        } catch (InterruptedException e) {
            executorService.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    public Map<String, Object> getCollectFactsStatus(Long taskId) {
        TaskContext context = taskContexts.get(taskId);
        if (context == null) {
            return null;
        }
        return context.getTask().getStatusMap();
    }

    private void processCollectFactsTask(CollectFactsTask task) {
        try {
            setTaskStatus(task, CollectFactsTask.STATUS_PROCESSING);
            task.addSystemLog("🚀 开始处理任务...");

            task.addSystemLog("🔄 开始分析查询策略...");
            List<SearchResultVO> results = switch (task.getSearchStrategy()) {
                case DIRECT_CONTENT -> {
                    task.addSystemLog("📄 使用直接内容查询模式");
                    yield processDirectContent(task);
                }
                case SIMILAR_QUESTION -> {
                    task.addSystemLog("🔍 使用相似问题查询模式");
                    yield processSimilarQuestion(task);
                }
                case NEW_QUESTION -> {
                    task.addSystemLog("✨ 使用新问题处理模式");
                    yield processNewQuestion(task);
                }
            };
            task.setResults(convertToMapList(results));
            setTaskStatus(task, CollectFactsTask.STATUS_COMPLETED);

        } catch (Exception e) {
            logger.error("Error processing collect facts task: {}", task.getTaskId(), e);
            task.addSystemLog("❌ 任务处理失败: " + e.getMessage());
            setTaskStatus(task, CollectFactsTask.STATUS_FAILED);
            task.setError(e.getMessage());
        }
    }

    // 入口方法
    public Map<String, Object> handleCollectFactsRequest(Map<String, Object> requestParams) {
        String pathPrefix = String.valueOf(requestParams.get("pathPrefix"));
        String query = String.valueOf(requestParams.get("query"));

        // 1. 先创建任务
        CollectFactsTask task = createCollectFactsTask(pathPrefix, query);

        // 2. 确定策略并更新任务
        SimilarQuestionResult similarResult = null;
        if (pathPrefix.endsWith("/") || pathPrefix.endsWith("\\")) {
            // 只有在目录模式下才检查相似问题，同时传入pathPrefix
            similarResult = findSimilarQuestions(query, pathPrefix);
            if (similarResult.hasSimilar) {
                task.setSearchStrategy(SearchStrategy.SIMILAR_QUESTION);
                task.setSimilarTaskIds(similarResult.similarTaskIds);
            } else {
                task.setSearchStrategy(SearchStrategy.NEW_QUESTION);
            }
        } else {
            task.setSearchStrategy(SearchStrategy.DIRECT_CONTENT);
        }

        // 3. 提交任务
        Long taskId = submitTask(task);

        Map<String, Object> response = new HashMap<>();
        response.put("taskId", taskId);
        return response;
    }

    private CollectFactsTask createCollectFactsTask(String pathPrefix, String query) {
        Long taskId = taskIdGenerator.incrementAndGet();
        return new CollectFactsTask(taskId, pathPrefix, query, taskContexts);
    }

    private static class SimilarQuestionResult {
        private final boolean hasSimilar;
        private final List<Long> similarTaskIds;

        public SimilarQuestionResult(boolean hasSimilar, List<Long> similarTaskIds) {
            this.hasSimilar = hasSimilar;
            this.similarTaskIds = similarTaskIds;
        }
    }

    // 添加用于解析LLM响应的内部类
    private static class SimilarQuestionLLMResponse {
        public List<SimilarQuestionMatch> similarQuestions;

        public static class SimilarQuestionMatch {
            public Long taskId;
            public int similarity;
            public String reason;
        }
    }

    // 修改 findSimilarQuestions 方法，增加 pathPrefix 参数
    private SimilarQuestionResult findSimilarQuestions(String query, String currentPathPrefix) {
        try {
            // 1. 获取所有活跃的任务及其问题
            List<RefineryTaskDO> activeTasks = refineryTaskRepository.findByStatus(RefineryTaskDO.STATUS_ACTIVE);

            if (activeTasks.isEmpty()) {
                return new SimilarQuestionResult(false, Collections.emptyList());
            }

            // 2. 构建历史问题列表，同时检查路径关系
            StringBuilder historyQuestions = new StringBuilder();
            for (RefineryTaskDO task : activeTasks) {
                // 检查路径关系：只有当当前路径包含在历史任务的目录路径中时才考虑
                String taskDirectoryPath = task.getDirectoryPath();

                // 标准化路径（确保都以分隔符结尾）
                if (!taskDirectoryPath.endsWith("/") && !taskDirectoryPath.endsWith("\\")) {
                    taskDirectoryPath += File.separator;
                }
                if (!currentPathPrefix.endsWith("/") && !currentPathPrefix.endsWith("\\")) {
                    currentPathPrefix += File.separator;
                }

                // 只有当前查询路径在历史任务目录范围内时，才添加到比较列表
                if (currentPathPrefix.startsWith(taskDirectoryPath)) {
                    historyQuestions.append("TaskID: ").append(task.getId())
                            .append("\n问题: ").append(task.getKeyQuestion())
                            .append("\n目录: ").append(task.getDirectoryPath())
                            .append("\n\n");
                }
            }

            // 如果没有找到任何符合路径条件的历史问题，直接返回
            if (historyQuestions.length() == 0) {
                return new SimilarQuestionResult(false, Collections.emptyList());
            }

            // 3. 构建prompt参数
            Map<String, Object> params = new HashMap<>();
            params.put("currentQuestion", query);
            params.put("historyQuestions", historyQuestions.toString());

            // 4. 调用LLM
            PromptTemplate promptTemplate = new PromptTemplate(findSimilarQuestionsPrompt);
            Message userMessage = promptTemplate.createMessage(params);
            Prompt prompt = new Prompt(Collections.singletonList(userMessage));

            String response = singletonLLMChat.sendThrottledRequest(prompt);

            // 5. 提取JSON结果
            String jsonStr = JsonExtractor.extractJsonFromResponse(response);
            if (jsonStr == null) {
                logger.error("Failed to extract JSON from response: {}", response);
                return new SimilarQuestionResult(false, Collections.emptyList());
            }

            // 6. 解析结果
            SimilarQuestionLLMResponse llmResponse = objectMapper.readValue(jsonStr, SimilarQuestionLLMResponse.class);

            if (llmResponse == null || llmResponse.similarQuestions == null || llmResponse.similarQuestions.isEmpty()) {
                return new SimilarQuestionResult(false, Collections.emptyList());
            }

            // 7. 提取相似问题的taskId
            List<Long> similarTaskIds = llmResponse.similarQuestions.stream()
                    .map(sq -> sq.taskId)
                    .toList();

            return new SimilarQuestionResult(true, similarTaskIds);

        } catch (Exception e) {
            logger.error("Error finding similar questions: {}", e.getMessage());
            return new SimilarQuestionResult(false, Collections.emptyList());
        }
    }

    private Long submitTask(CollectFactsTask task) {
        Future<?> future = executorService.submit(() -> processCollectFactsTask(task));
        taskContexts.put(task.getTaskId(), new TaskContext(task, future));
        return task.getTaskId();
    }

    /**
     * 终止指定的任务
     */
    public void cancelTask(Long taskId) {
        TaskContext context = taskContexts.get(taskId);
        if (context == null) {
            throw new RuntimeException("Task not found: " + taskId);
        }

        // 取消任务执行
        if (context.getFuture() != null) {
            context.getFuture().cancel(true);
        }

        // 更新任务状态
        context.getTask().setStatus(CollectFactsTask.STATUS_CANCELLED);
        context.getTask().setError("Task cancelled by user");
    }

    // 修改任务状态设置方法，添加时间戳
    private void setTaskStatus(CollectFactsTask task, String status) {
        task.setStatus(status);
    }

    private List<SearchResultVO> processDirectContent(CollectFactsTask task) {
        task.addSystemLog("🔍 开始直接内容查询...");
        List<SearchResultVO> results = fetchDocumentContent(task, task.getPathPrefix());
        task.addSystemLog(String.format("✅ 直接内容查询完成，找到 %d 个匹配结果", results.size()));
        return results;
    }

    private List<SearchResultVO> processSimilarQuestion(CollectFactsTask task) {
        List<Long> similarTaskIds = task.getSimilarTaskIds();
        if (similarTaskIds == null || similarTaskIds.isEmpty()) {
            task.addSystemLog("⚠️ 未找到相似问题");
            return new ArrayList<>();
        }

        task.addSystemLog(String.format("🔍 找到 %d 个相似问题，开始提取相关内容...", similarTaskIds.size()));

        Set<Long> processedParagraphIds = new HashSet<>();
        List<SearchResultVO> results = new ArrayList<>();

        try {
            for (Long taskId : similarTaskIds) {
                // // 1. 获取任务信息
                // RefineryTaskDO similarTask = refineryTaskRepository.findById(taskId)
                // .orElseThrow(() -> new RuntimeException("Similar task not found: " +
                // taskId));

                // 2. 获取当前任务的所有事实
                List<RefineryFactDO> facts = refineryFactRepository.findByRefineryTaskId(taskId);

                for (RefineryFactDO fact : facts) {
                    // 跳过已处理的段落
                    if (processedParagraphIds.contains(fact.getParagraphId())) {
                        continue;
                    }

                    // 3. 获取段落信息
                    MarkdownParagraphPO paragraph = markdownParagraphRepository.findById(fact.getParagraphId())
                            .orElse(null);

                    if (paragraph == null) {
                        continue;
                    }

                    // 4. 获取文档信息
                    DocumentDataPO doc = documentDataRepository.findById(paragraph.getDocumentDataId())
                            .orElse(null);

                    if (doc == null) {
                        continue;
                    }

                    // 5. 检查文件路径是否匹配
                    if (!doc.getFilePath().startsWith(task.getPathPrefix())) {
                        continue;
                    }

                    // 6. 创建搜索结果
                    SearchResultVO searchResult = new SearchResultVO(
                            paragraph.getId(),
                            doc.getFileName(),
                            fact.getFact(), // 使用提取的事实作为内容
                            paragraph.getCreatedDateTime(),
                            doc.getFilePath());

                    results.add(searchResult);
                    processedParagraphIds.add(fact.getParagraphId());
                }
                RefineryTaskDO similarTask = refineryTaskRepository.findById(taskId)
                        .orElseThrow(() -> new RuntimeException("Similar task not found: " + taskId));
                similarTask.setHitCount(similarTask.getHitCount() + 1);
                refineryTaskRepository.save(similarTask);
            }

            // 修改排序规则：按照ID正序排序
            results.sort((r1, r2) -> Long.compare(r1.getId(), r2.getId()));
            task.addSystemLog(String.format("✅ 成功处理相似问题，提取了 %d 个相关段落", results.size()));
            return results;

        } catch (Exception e) {
            task.addSystemLog("❌ 处理相似问题时发生错误");
            logger.error("Error processing similar questions for task {}: {}", task.getTaskId(), e.getMessage());
            throw new RuntimeException("Failed to process similar questions", e);
        }
    }

    private List<SearchResultVO> processNewQuestion(CollectFactsTask task) {
        task.addSystemLog("🔄 准备处理新问题查询...");

        String pathPrefix = task.getPathPrefix();
        String pathWithWildcard = pathPrefix;

        // 检查系统类型并使用对应的分隔符
        boolean isWindows = System.getProperty("os.name").toLowerCase().contains("win");
        String separator = isWindows ? "\\" : "/";

        // 确保不以*结尾才添加通配符
        if (!pathWithWildcard.endsWith("*")) {
            // 根据是否以分隔符结尾决定如何添加通配符
            pathWithWildcard = pathWithWildcard.endsWith(separator) ? pathWithWildcard + "*"
                    : pathWithWildcard + separator + "*";
        }

        task.addSystemLog("🔍 使用通配路径进行查询: " + pathWithWildcard);

        List<SearchResultVO> results = fetchDocumentContent(task, pathWithWildcard);
        task.addSystemLog(String.format("✅ 新问题处理完成，找到 %d 个相关内容", results.size()));
        return results;
    }

    private List<Map<String, Object>> convertToMapList(List<SearchResultVO> results) {
        return results.stream()
                .map(result -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", result.getId());
                    map.put("title", result.getTitle());
                    map.put("summary", result.getDescription());
                    map.put("fact", result.getDescription());
                    map.put("date", result.getDate());
                    map.put("url", result.getUrl());
                    return map;
                })
                .collect(Collectors.toList());
    }

    private List<SearchResultVO> fetchDocumentContent(CollectFactsTask task, String pathPrefix) {
        task.addSystemLog("📂 正在查找匹配的文档...");

        // 处理带有通配符的路径
        List<DocumentDataPO> documentDataList;
        if (pathPrefix.contains("*")) {
            documentDataList = findDocumentsWithWildcard(pathPrefix);
            task.addSystemLog(String.format("🔍 找到 %d 个匹配的文档", documentDataList.size()));
        } else {
            Optional<DocumentDataPO> documentDataOpt = documentDataRepository.findByFilePath(pathPrefix);
            if (documentDataOpt.isEmpty()) {
                logger.error("Document not found for pathPrefix: " + pathPrefix);
                task.addSystemLog("❌ 未找到指定路径的文档: " + pathPrefix);
                return new ArrayList<>();
            }
            documentDataList = List.of(documentDataOpt.get());
            task.addSystemLog("✅ 成功定位目标文档");
        }

        // 为每个文档创建一个处理任务
        List<SearchResultVO> searchResults = processDocuments(documentDataList, task);

        task.addSystemLog(String.format("🎯 所有文档处理完成，共找到 %d 个结果", searchResults.size()));
        searchResults.sort((r1, r2) -> Long.compare(r1.getId(), r2.getId()));
        return searchResults;
    }

    private List<DocumentDataPO> findDocumentsWithWildcard(String pathPrefix) {
        String sqlPattern = pathPrefix.replace("\\", "\\\\").replace("*", "%");
        return documentDataRepository.findByFilePathLike(sqlPattern);
    }

    // 添加处理单个文档的方法
    private static class BatchProcessingInfo {
        private final Future<ExtractFactsResult> future;
        private final DocumentDataPO documentData;

        public BatchProcessingInfo(Future<ExtractFactsResult> future, DocumentDataPO documentData) {
            this.future = future;
            this.documentData = documentData;
        }
    }

    private List<SearchResultVO> processDocuments(List<DocumentDataPO> documentDataList, CollectFactsTask task) {

        int processedDocs = 0;

        // 修改为存储BatchProcessingInfo的列表
        List<BatchProcessingInfo> batchProcessingInfos = new ArrayList<>();

        int totalBatchCount = 0; // 添加总批次计数器

        // 首先批量提交所有文档的处理任务
        for (DocumentDataPO documentData : documentDataList) {
            processedDocs++;
            final int currentDoc = processedDocs;
            if (task.getStatus().equals(CollectFactsTask.STATUS_CANCELLED)) {
                task.addSystemLog("❌ 任务已取消，停止处理文档");
                break;
            }
            task.addSystemLog(String.format("📄 提交文档处理任务 (%d/%d): %s",
                    currentDoc, documentDataList.size(), documentData.getFileName()));

            Long documentDataId = documentData.getId();
            try {
                List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository
                        .findByDocumentDataIdOrderById(documentDataId);
                task.addSystemLog(
                        String.format("📝 文档 %s: 找到 %d 个段落需要分析", documentData.getFileName(), paragraphs.size()));

                // 计算每个段落的JSON大小并分组
                List<List<Map<String, Object>>> batches = new ArrayList<>();
                List<Map<String, Object>> currentBatch = new ArrayList<>();
                int currentBatchSize = 0;

                for (MarkdownParagraphPO paragraph : paragraphs) {
                    Map<String, Object> content = new HashMap<>();

                    content.put("documentPartFileName", documentData.getFileName());
                    content.put("id", paragraph.getId().toString());
                    content.put("content", paragraph.getContent());

                    // 计算JSON大小
                    String jsonContent = objectMapper.writeValueAsString(content);
                    int contentSize = jsonContent.length();

                    // 如果加入当前内容后会超过最大批次大小，创建新批次
                    if (currentBatchSize + contentSize > MAX_BATCH_SIZE) {
                        batches.add(new ArrayList<>(currentBatch));
                        currentBatch.clear();
                        currentBatchSize = 0;
                    }

                    currentBatch.add(content);
                    currentBatchSize += contentSize;
                }

                // 添加最后一个批次
                if (!currentBatch.isEmpty()) {
                    batches.add(currentBatch);
                }

                totalBatchCount += batches.size(); // 累计所有文档的批次总数
                task.addSystemLog(String.format("📝 文档 %s: 分成 %d 个批次进行处理", 
                    documentData.getFileName(), batches.size()));

                for (int i = 0; i < batches.size(); i++) {
                    BatchExtractTask extractTask = new BatchExtractTask(batches.get(i), task.getQuery(), totalBatchCount + i, refineryService, task);
                    Future<ExtractFactsResult> future = refineryService.submitTask(extractTask);
                    batchProcessingInfos.add(new BatchProcessingInfo(future, documentData));
                }

            } catch (Exception e) {
                task.addSystemLog(String.format("❌ 文档 %s: 处理失败: %s",
                        documentData.getFileName(), e.getMessage()));
                logger.error("Error processing document {}: {}",
                        documentData.getFilePath(), e.getMessage());
            }
        }

        task.addSystemLog(String.format("🚀 所有文档共分成 %d 个批次并行执行", totalBatchCount));

        // 收集所有结果
        Map<Long, List<String>> factMap = new HashMap<>();
        Map<Long, DocumentDataPO> documentDataMap = new HashMap<>();
        int totalBatches = batchProcessingInfos.size();

        for (int i = 0; i < batchProcessingInfos.size(); i++) {
            BatchProcessingInfo info = batchProcessingInfos.get(i);

            if (task.getStatus().equals(CollectFactsTask.STATUS_CANCELLED)) {
                info.future.cancel(true);
                continue;
            }
            try {
                task.addSystemLog(String.format("⏳ 正在处理第 %d/%d 批次...", 
                    i + 1, totalBatchCount));
                ExtractFactsResult result = info.future.get();

                for (ExtractedFact fact : result.getFacts()) {
                    Long paragraphId = fact.getId();
                    if (fact.getFact() != null && !fact.getFact().isEmpty()) {
                        factMap.computeIfAbsent(paragraphId, k -> new ArrayList<>()).add(fact.getFact());
                        documentDataMap.put(paragraphId, info.documentData);
                    }
                }

            } catch (Exception e) {
                task.addSystemLog(String.format("❌ 第 %d/%d 批次处理失败: %s", i + 1, totalBatchCount, e.getMessage()));
                logger.error("Error processing batch {}/{}", i + 1, totalBatches, e);
            }
        }

        // 使用 factMap 和 documentDataMap 构建搜索结果
        List<SearchResultVO> searchResults = factMap.entrySet().stream()
                .map(entry -> {
                    Long paragraphId = entry.getKey();
                    List<String> facts = entry.getValue();
                    DocumentDataPO docData = documentDataMap.get(paragraphId);
                    String combinedFacts = String.join("\n", facts);

                    return new SearchResultVO(
                            paragraphId,
                            docData.getFileName(),
                            combinedFacts,
                            LocalDateTime.now(),
                            docData.getFilePath());
                })
                .filter(searchResult -> !searchResult.getDescription().isEmpty())
                .sorted((r1, r2) -> Long.compare(r1.getId(), r2.getId()))
                .collect(Collectors.toList());

        return searchResults;
    }
}
