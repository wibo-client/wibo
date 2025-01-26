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
import java.util.stream.Collectors;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.JsonProcessingException;

@Service
public class RefineryService implements DocumentEventListener {
    private static final Logger logger = LoggerFactory.getLogger(RefineryService.class);
    private static final int MAX_CONTENT_SIZE = 28720;

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

    public RefineryTaskVO createTask(RefineryTaskVO taskVO) {
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

            extractFactsFromParagraph(paragraphs, task.getKeyQuestion(), task);

            // 不再需要这里的批量保存，因为已经在处理批次时保存了
            // 只需要更新任务状态即可

        } catch (Exception e) {
            throw new RuntimeException("Task processing failed: " + e.getMessage(), e);
        }
    }

    private void extractFactsFromParagraph(List<MarkdownParagraphPO> paragraphs, String question,
            RefineryTaskDO task) {
        int currentLength = 0;
        int batchIndex = 1;
        List<Map<String, Object>> currentBatch = new ArrayList<>();
        Long lastProcessedId = null;
        int totalTokenCost = 0;

        for (MarkdownParagraphPO paragraph : paragraphs) {
            Map<String, Object> reference = new HashMap<>();
            reference.put("part", "第" + batchIndex + "篇参考内容");
            reference.put("id", paragraph.getId());
            reference.put("content", paragraph.getContent());
            reference.put("paragraphOrder", paragraph.getParagraphOrder());
            reference.put("date", paragraph.getCreatedDateTime());
            batchIndex++;
            try {
                String jsonStr = objectMapper.writeValueAsString(reference);
                totalTokenCost += jsonStr.length(); // 累加输入token成本

                if (currentLength + jsonStr.length() < MAX_CONTENT_SIZE) {
                    currentBatch.add(reference);
                    currentLength += jsonStr.length();
                    continue;
                }

                // Process current batch and add response token cost
                totalTokenCost += processBatchAndGetTokenCost(currentBatch, question, task, batchIndex);
                lastProcessedId = updateCheckpoint(currentBatch, task);

                // Reset batch
                currentBatch = new ArrayList<>();
                currentLength = 0;

            } catch (JsonProcessingException e) {
                logger.error("Failed to serialize reference to JSON", e);
                throw new RuntimeException(e);
            }
        }

        // Process final batch
        if (!currentBatch.isEmpty()) {
            totalTokenCost += processBatchAndGetTokenCost(currentBatch, question, task, batchIndex);
            lastProcessedId = updateCheckpoint(currentBatch, task);
        }

        // Update token cost
        task.setFullUpdateTokenCost(totalTokenCost); 这里更新一下，fullUpdateTokenCost放 外面，这里只返回cost 。这样可以兼容两种情况
        refineryTaskRepository.save(task);

    }

    private Long updateCheckpoint(List<Map<String, Object>> batch, RefineryTaskDO task) {
        // 获取当前批次中最大的ID
        Long maxId = batch.stream()
                .map(ref -> Long.valueOf(ref.get("id").toString()))
                .max(Long::compareTo)
                .orElse(null);

        if (maxId != null) {
            task.setProcessingCheckpoint(maxId.toString());
            refineryTaskRepository.save(task);
        }

        return maxId;
    }

    private int processBatchAndGetTokenCost(List<Map<String, Object>> batch, String question,
            RefineryTaskDO task, int batchIndex) {
        Map<String, Object> params = new HashMap<>();

        String jsonInput;
        try {
            jsonInput = objectMapper.writeValueAsString(batch);
        } catch (JsonProcessingException e) {
            logger.error("Failed to serialize params to JSON", e);
            throw new RuntimeException(e);
        }

        params.put("references", jsonInput);
        params.put("question", question);

        PromptTemplate promptTemplate = new PromptTemplate(extractFactsPrompt);
        Message userMessage = promptTemplate.createMessage(params);
        List<Message> messages = Collections.singletonList(userMessage);

        try {
            for (int attempt = 0; attempt < 3; attempt++) {
                try {
                    Prompt prompt = new Prompt(messages);
                    String response = singletonLLMChat.getChatClient()
                            .prompt(prompt)
                            .call()
                            .content();

                    // 先提取JSON字符串
                    String jsonStr = JsonExtractor.extractJsonFromResponse(response);
                    if (jsonStr == null) {
                        logger.error("Failed to extract JSON from response: {}", response);
                        continue;
                    }

                    // 解析JSON并处理事实
                    ExtractFactResponse factResponse = objectMapper.readValue(jsonStr, ExtractFactResponse.class);
                    if (factResponse != null && factResponse.getFacts() != null) {
                        // 立即处理每个事实
                        for (ExtractedFact fact : factResponse.getFacts()) {
                            Long paragraphId = Long.parseLong(fact.getId());

                            // 查找现有的事实
                            Optional<RefineryFactDO> existingFact = refineryFactRepository
                                    .findByRefineryTaskIdAndParagraphId(task.getId(), paragraphId)
                                    .stream()
                                    .findFirst();

                            if (existingFact.isPresent()) {
                                // 更新现有事实
                                RefineryFactDO factDO = existingFact.get();
                                factDO.setFact(fact.getFact());
                                refineryFactRepository.save(factDO);
                            } else {
                                // 创建新事实
                                RefineryFactDO factDO = new RefineryFactDO(task.getId(), paragraphId, fact.getFact());
                                refineryFactRepository.save(factDO);
                            }
                        }
                        logger.info("Successfully processed and saved batch {}, extracted {} facts",
                                batchIndex, factResponse.getFacts().size());

                        return response.length();
                    }
                } catch (Exception e) {
                    if (attempt == 2) {
                        logger.error("Failed to process batch {} after 3 attempts", batchIndex, e);
                        throw e;
                    }
                    logger.warn("Attempt {} failed for batch {}, retrying...", attempt + 1, batchIndex);
                    Thread.sleep(1000 * (attempt + 1));
                }
            }
        } catch (Exception e) {
            logger.error("Error processing batch {}", batchIndex, e);
            throw new RuntimeException("Failed to process batch " + batchIndex, e);
        }
        return 0;
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

        // 修改这行代码，使用 findByDirectoryPathLikeAndStatus 方法
        String directoryPathPattern = getParentPath(document.getFilePath()) + "%";
        List<RefineryTaskDO> relatedTasks = refineryTaskRepository.findByDirectoryPathLikeAndStatus(
                directoryPathPattern,
                RefineryTaskDO.STATUS_ACTIVE);

        for (RefineryTaskDO task : relatedTasks) {
            try {
                // 获取文档的所有段落
                List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository
                        .findByDocumentDataId(document.getId());

                // 删除旧的事实
                List<Long> paragraphIds = paragraphs.stream()
                        .map(MarkdownParagraphPO::getId)
                        .toList();
                if (!paragraphIds.isEmpty()) {
                    refineryFactRepository.deleteByRefineryTaskIdAndParagraphIdIn(task.getId(), paragraphIds);
                }

                extractFactsFromParagraph(paragraphs, task.getKeyQuestion(), task);

                // 更新任务统计信息
                int incrementalTokenCost = task.getIncrementalTokenCost() + facts.size() * 100; // 估算token消耗
                task.setIncrementalTokenCost(incrementalTokenCost);
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
}
