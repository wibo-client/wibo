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
import com.wibot.service.dto.ExtractedFact;
import com.wibot.utils.JsonExtractor;

import jakarta.annotation.PreDestroy;

import com.wibot.index.DocumentIndexInterface;
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
import java.util.ArrayList;
import java.util.Collections;
import java.time.LocalDateTime;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.ArrayBlockingQueue;

import java.util.stream.Collectors;

import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.controller.vo.SearchResultVO;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;

import org.springframework.scheduling.annotation.Scheduled;

@Service
public class SearchService {
    private static final Logger logger = LoggerFactory.getLogger(SearchService.class);

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    @Autowired
    private RefineryTaskRepository refineryTaskRepository;

    @Autowired
    private RefineryFactRepository refineryFactRepository;

    @Autowired
    private DocumentIndexInterface documentIndexInterface;

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

    private final AtomicLong taskIdGenerator = new AtomicLong(0);
    private final ExecutorService executorService = Executors.newFixedThreadPool(3, 
        new ThreadFactory() {
            private final AtomicInteger threadNumber = new AtomicInteger(1);
            
            @Override
            public Thread newThread(Runnable r) {
                Thread thread = new Thread(r);
                thread.setName("SearchService-Worker-" + threadNumber.getAndIncrement());
                thread.setDaemon(false);
                return thread;
            }
        });

    private final ExecutorService aiAnalysisExecutor = new ThreadPoolExecutor(
        4, // 核心线程数为2
        4, // 最大线程数为2
        60L, // 空闲线程存活时间
        TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(10), // 队列长度为10
        new ThreadFactory() {
            private final AtomicInteger threadNumber = new AtomicInteger(1);
            @Override
            public Thread newThread(Runnable r) {
                Thread thread = new Thread(r);
                thread.setName("AIAnalysis-Worker-" + threadNumber.getAndIncrement());
                return thread;
            }
        },
        new ThreadPoolExecutor.CallerRunsPolicy() // 队列满时使用调用者线程执行
    );

    private static class TaskContext {
        final CollectFactsTask task;
        final Future<?> future;

        TaskContext(CollectFactsTask task, Future<?> future) {
            this.task = task;
            this.future = future;
        }
    }

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
        aiAnalysisExecutor.shutdown();
        try {
            if (!aiAnalysisExecutor.awaitTermination(60, TimeUnit.SECONDS)) {
                aiAnalysisExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            aiAnalysisExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private enum SearchStrategy {
        DIRECT_CONTENT, // 直接获取文档内容
        SIMILAR_QUESTION, // 类似问题答案
        NEW_QUESTION // 新问题处理
    }

    public Map<String, Object> getCollectFactsStatus(Long taskId) {
        TaskContext context = taskContexts.get(taskId);
        if (context == null) {
            return null;
        }
        return context.task.getStatus();
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

    private static class CollectFactsTask {
        // 添加任务状态常量
        public static final String STATUS_PENDING = "PENDING";
        public static final String STATUS_PROCESSING = "PROCESSING";
        public static final String STATUS_COMPLETED = "COMPLETED";
        public static final String STATUS_FAILED = "FAILED";
        public static final String STATUS_CANCELLED = "CANCELLED";

        private final Long taskId;
        private final String pathPrefix;
        private final String query;
        private volatile String status = STATUS_PENDING;
        private volatile String error;
        private volatile List<Map<String, Object>> results;
        private SearchStrategy searchStrategy;
        private List<Long> similarTaskIds;
        private final List<String> systemLogs = Collections.synchronizedList(new ArrayList<>());

        public CollectFactsTask(Long taskId, String pathPrefix, String query) {
            this.taskId = taskId;
            this.pathPrefix = pathPrefix;
            this.query = query;
        }

        private boolean isTerminalStatus(String status) {
            return STATUS_COMPLETED.equals(status) ||
                    STATUS_FAILED.equals(status) ||
                    STATUS_CANCELLED.equals(status);
        }

        public synchronized Map<String, Object> getStatus() {
            Map<String, Object> statusMap = new HashMap<>();
            statusMap.put("taskId", taskId);
            statusMap.put("status", status);
            statusMap.put("error", error);
            statusMap.put("results", results);
            statusMap.put("systemLogs", systemLogs); // 添加系统日志到状态

            // 如果是终态，返回状态后清理任务
            if (isTerminalStatus(status)) {
                SearchService.taskContexts.remove(taskId);
            }

            return statusMap;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public void setError(String error) {
            this.error = error;
        }

        public void setResults(List<Map<String, Object>> results) {
            this.results = results;
        }

        public Long getTaskId() {
            return taskId;
        }

        public String getPathPrefix() {
            return pathPrefix;
        }

        public String getQuery() {
            return query;
        }

        public void setSearchStrategy(SearchStrategy strategy) {
            this.searchStrategy = strategy;
        }

        public SearchStrategy getSearchStrategy() {
            return searchStrategy;
        }

        public void setSimilarTaskIds(List<Long> taskIds) {
            this.similarTaskIds = taskIds;
        }

        public List<Long> getSimilarTaskIds() {
            return similarTaskIds;
        }

        // 添加日志方法
        public void addSystemLog(String log) {
            systemLogs.add(log);
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
        if (pathPrefix.endsWith("/") || pathPrefix.endsWith("\\"))  {
            // 只有在目录模式下才检查相似问题
            similarResult = findSimilarQuestions(query);
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
        return new CollectFactsTask(taskId, pathPrefix, query);
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

    private SimilarQuestionResult findSimilarQuestions(String query) {
        try {
            // 1. 获取所有活跃的任务及其问题
            List<RefineryTaskDO> activeTasks = refineryTaskRepository.findByStatus(RefineryTaskDO.STATUS_ACTIVE);

            if (activeTasks.isEmpty()) {
                return new SimilarQuestionResult(false, Collections.emptyList());
            }

            // 2. 构建历史问题列表
            StringBuilder historyQuestions = new StringBuilder();
            for (RefineryTaskDO task : activeTasks) {
                historyQuestions.append("TaskID: ").append(task.getId())
                        .append("\n问题: ").append(task.getKeyQuestion())
                        .append("\n\n");
            }

            // 3. 构建prompt参数
            Map<String, Object> params = new HashMap<>();
            params.put("currentQuestion", query);
            params.put("historyQuestions", historyQuestions.toString());

            // 4. 调用LLM
            PromptTemplate promptTemplate = new PromptTemplate(findSimilarQuestionsPrompt);
            Message userMessage = promptTemplate.createMessage(params);
            Prompt prompt = new Prompt(Collections.singletonList(userMessage));

            String response = singletonLLMChat.getChatClient()
                    .prompt(prompt)
                    .call()
                    .content();

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
        if (context.future != null) {
            context.future.cancel(true);
        }

        // 更新任务状态
        context.task.setStatus(CollectFactsTask.STATUS_CANCELLED);
        context.task.setError("Task cancelled by user");
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
            pathWithWildcard = pathWithWildcard.endsWith(separator) ? 
                pathWithWildcard + "*" : 
                pathWithWildcard + separator + "*";
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

        List<SearchResultVO> searchResults = new ArrayList<>();
        List<Future<List<SearchResultVO>>> documentFutures = new ArrayList<>();
        int processedDocs = 0;

        // 首先批量提交所有文档的处理任务
        for (DocumentDataPO documentData : documentDataList) {
            processedDocs++;
            final int currentDoc = processedDocs;
            
            task.addSystemLog(String.format("📄 提交文档处理任务 (%d/%d): %s", 
                currentDoc, documentDataList.size(), documentData.getFileName()));

            // 为每个文档创建一个处理任务
            Future<List<SearchResultVO>> docFuture = aiAnalysisExecutor.submit(() -> {
                List<SearchResultVO> docResults = new ArrayList<>();
                Long documentDataId = documentData.getId();
                String title = documentData.getFileName();
                
                List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository.findByDocumentDataId(documentDataId);
                task.addSystemLog(String.format("📝 文档 %s: 找到 %d 个段落需要分析，本步骤较慢，多等等哦", documentData.getFileName(), paragraphs.size()));

                List<Map<String, Object>> batchInput = paragraphs.stream()
                        .map(paragraph -> {
                            Map<String, Object> content = new HashMap<>();
                            content.put("id", paragraph.getId().toString());
                            content.put("content", paragraph.getContent());
                            return content;
                        })
                        .collect(Collectors.toList());
                try {
                    ExtractFactsResult result = refineryService.extractFactsFromContent(batchInput, task.getQuery());
                    
                    int relevantFacts = (int) result.getFacts().stream()
                        .filter(fact -> !fact.getFact().isEmpty())
                        .count();
                    task.addSystemLog(String.format("✨ 文档 %s: AI分析完成，找到 %d 个相关内容", documentData.getFileName(), relevantFacts));

                    Map<Long, String> summaryMap = result.getFacts().stream()
                            .collect(Collectors.toMap(
                                    fact -> Long.parseLong(fact.getId()),
                                    ExtractedFact::getFact,
                                    (existing, replacement) -> existing
                            ));

                    docResults.addAll(paragraphs.stream()
                            .map(paragraph -> new SearchResultVO(
                                    paragraph.getId(),
                                    title,
                                    summaryMap.getOrDefault(paragraph.getId(), ""),
                                    paragraph.getCreatedDateTime(),
                                    documentData.getFilePath()))
                            .filter(searchResult -> {
                                String description = searchResult.getDescription();
                                return description != null && !description.isEmpty();
                            })
                            .collect(Collectors.toList()));

                } catch (Exception e) {
                    task.addSystemLog(String.format("⚠️ 文档 %s: 处理出错: %s", documentData.getFileName(), e.getMessage()));
                    logger.error("Error processing document {}: {}", documentData.getFilePath(), e.getMessage());
                    
                    // 发生错误时返回空描述的结果
                    docResults.addAll(paragraphs.stream()
                            .map(paragraph -> new SearchResultVO(
                                    paragraph.getId(),
                                    title,
                                    "",
                                    paragraph.getCreatedDateTime(),
                                    documentData.getFilePath()))
                            .collect(Collectors.toList()));
                }
                
                return docResults;
            });

            documentFutures.add(docFuture);
        }

        // 等待所有文档处理完成并收集结果
        for (Future<List<SearchResultVO>> future : documentFutures) {
            try {
                searchResults.addAll(future.get());
            } catch (Exception e) {
                logger.error("Error getting document processing results", e);
                task.addSystemLog("⚠️ 获取处理结果时出错: " + e.getMessage());
            }
        }

        task.addSystemLog(String.format("🎯 所有文档处理完成，共找到 %d 个结果", searchResults.size()));
        searchResults.sort((r1, r2) -> Long.compare(r1.getId(), r2.getId()));
        return searchResults;
    }

    private List<DocumentDataPO> findDocumentsWithWildcard(String pathPrefix) {
        String sqlPattern = pathPrefix.replace("\\", "\\\\").replace("*", "%");
        return documentDataRepository.findByFilePathLike(sqlPattern);
    }
}
