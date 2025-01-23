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
import org.springframework.transaction.annotation.Transactional;

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
import com.wibot.documentLoader.event.DocumentEventListener;
import com.wibot.documentLoader.event.DocumentProcessEvent;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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

    private final ObjectMapper objectMapper = new ObjectMapper();

    public RefineryTaskVO createTask(RefineryTaskVO taskVO) {
        // 转换VO到DO
        RefineryTaskDO taskDO = new RefineryTaskDO();
        taskDO.setDirectoryPath(taskVO.getDirectoryPath());
        taskDO.setKeyQuestion(taskVO.getKeyQuestion());
        taskDO.setUpdateCycle(taskVO.getUpdateCycle());

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

    @Scheduled(fixedDelay = 60000) // 每分钟执行一次
    public void processScheduledTasks() {
        logger.info("Starting scheduled task processing");

        // 1. 只获取待处理状态的任务
        List<RefineryTaskDO> tasksToProcess = refineryTaskRepository.findByStatus(RefineryTaskDO.STATUS_PENDING);

        for (RefineryTaskDO task : tasksToProcess) {
            try {
                // 2. 检查是否需要执行（根据更新周期）
                if (!shouldProcessTask(task)) {
                    continue;
                }

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

    private boolean shouldProcessTask(RefineryTaskDO task) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime lastUpdate = task.getLastUpdateTime();

        return switch (task.getUpdateCycle()) {
            case RefineryTaskDO.CYCLE_DAILY ->
                lastUpdate.plusDays(1).isBefore(now);
            case RefineryTaskDO.CYCLE_WEEKLY ->
                lastUpdate.plusWeeks(1).isBefore(now);
            case RefineryTaskDO.CYCLE_MONTHLY ->
                lastUpdate.plusMonths(1).isBefore(now);
            default -> false;
        };
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

            List<ExtractedFact> facts = extractFactsFromParagraph(paragraphs, task.getKeyQuestion(), task);

            // 保存提取的事实 - 简化版本
            for (ExtractedFact fact : facts) {
                Long paragraphId = Long.parseLong(fact.getId());

                // 直接删除旧记录，不做查询
                refineryFactRepository.deleteByRefineryTaskIdAndParagraphId(task.getId(), paragraphId);

                // 直接保存新记录
                RefineryFactDO factDO = new RefineryFactDO(
                        Long.valueOf(task.getId()),
                        paragraphId,
                        fact.getFact());
                refineryFactRepository.save(factDO);
            }

        } catch (Exception e) {
            // 保持原有的checkpoint不变，便于后续续传
            task.setProcessingCheckpoint(checkpoint);
            throw new RuntimeException("Task processing failed: " + e.getMessage(), e);
        }
    }

    private List<ExtractedFact> extractFactsFromParagraph(List<MarkdownParagraphPO> paragraphs, String question,
            RefineryTaskDO task) {
        List<ExtractedFact> allFacts = new ArrayList<>();
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

            try {
                String jsonStr = objectMapper.writeValueAsString(reference);
                totalTokenCost += jsonStr.length(); // 累加输入token成本

                if (currentLength + jsonStr.length() < MAX_CONTENT_SIZE) {
                    currentBatch.add(reference);
                    currentLength += jsonStr.length();
                    continue;
                }

                // Process current batch and add response token cost
                totalTokenCost += processBatchAndGetTokenCost(currentBatch, question, allFacts, batchIndex);
                lastProcessedId = updateCheckpoint(currentBatch, task);

                // Reset batch
                currentBatch = new ArrayList<>();
                currentBatch.add(reference);
                currentLength = jsonStr.length();
                batchIndex++;
            } catch (JsonProcessingException e) {
                logger.error("Failed to serialize reference to JSON", e);
                throw new RuntimeException(e);
            }
        }

        // Process final batch
        if (!currentBatch.isEmpty()) {
            totalTokenCost += processBatchAndGetTokenCost(currentBatch, question, allFacts, batchIndex);
            lastProcessedId = updateCheckpoint(currentBatch, task);
        }

        // Update token cost
        task.setFullUpdateTokenCost(totalTokenCost);
        refineryTaskRepository.save(task);

        return allFacts;
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
            List<ExtractedFact> allFacts, int batchIndex) {
        Map<String, Object> params = new HashMap<>();
        params.put("references", batch);
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
                        allFacts.addAll(factResponse.getFacts());
                        logger.info("Successfully processed batch {}, extracted {} facts",
                                batchIndex, factResponse.getFacts().size());

                        // 返回响应token成本
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
        vo.setUpdateCycle(taskDO.getUpdateCycle());
        vo.setHitCount(taskDO.getHitCount());
        vo.setLastUpdateTime(taskDO.getLastUpdateTime());
        vo.setCreateTime(taskDO.getCreateTime());
        vo.setStatus(taskDO.getStatus());
        vo.setErrorMessage(taskDO.getErrorMessage());
        vo.setProcessingCheckpoint(taskDO.getProcessingCheckpoint());
        return vo;
    }

    @Override
    @Transactional
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

                // 重新提取事实
                List<ExtractedFact> facts = extractFactsFromParagraph(paragraphs, task.getKeyQuestion(), task);

                // 保存新的事实
                for (ExtractedFact fact : facts) {
                    Long paragraphId = Long.parseLong(fact.getId());
                    RefineryFactDO factDO = new RefineryFactDO(task.getId(), paragraphId, fact.getFact());
                    refineryFactRepository.save(factDO);
                }

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
}
