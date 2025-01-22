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
import com.wibot.persistence.RefineryTaskRepository;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import com.wibot.persistence.entity.RefineryTaskDO;
import com.wibot.service.dto.ExtractFactResponse;
import com.wibot.service.dto.ExtractedFact;
import com.wibot.utils.JsonExtractor;
import com.wibot.controller.vo.RefineryTaskVO;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.alibaba.dashscope.utils.JsonUtils;
import com.fasterxml.jackson.core.JsonProcessingException;

@Service
public class RefineryService {
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

    public RefineryTaskVO getTask(String taskId) {
        return refineryTaskRepository.findById(taskId)
            .map(this::convertToVO)
            .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
    }

    @Scheduled(fixedDelay = 60000) // 每分钟执行一次
    @Transactional
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
            List<MarkdownParagraphPO> sortedParagraphIds = getSortedParagraphIds(task.getDirectoryPath());

            List<ExtractedFact> facts = extractFactsFromParagraph(sortedParagraphIds, task.getKeyQuestion());
            // TODO: 保存提取的事实到数据库

        } catch (Exception e) {
            task.setProcessingCheckpoint(checkpoint);
            throw new RuntimeException("Task processing failed: " + e.getMessage(), e);
        }
    }

    private List<ExtractedFact> extractFactsFromParagraph(List<MarkdownParagraphPO> paragraphs, String question) {
        List<ExtractedFact> allFacts = new ArrayList<>();
        int currentLength = 0;
        int batchIndex = 1;
        List<Map<String, Object>> currentBatch = new ArrayList<>();

        for (MarkdownParagraphPO paragraph : paragraphs) {
            Map<String, Object> reference = new HashMap<>();
            reference.put("part", "第" + batchIndex + "篇参考内容");
            reference.put("id", paragraph.getId());
            reference.put("content", paragraph.getContent());
            reference.put("paragraphOrder", paragraph.getParagraphOrder());
            reference.put("date", paragraph.getCreatedDateTime());

            String jsonStr = JsonUtils.toJson(reference);
            if (currentLength + jsonStr.length() < MAX_CONTENT_SIZE) {
                currentBatch.add(reference);
                currentLength += jsonStr.length();
                continue;
            }

            // Process current batch
            processBatch(currentBatch, question, allFacts, batchIndex);

            // Reset for next batch
            currentBatch = new ArrayList<>();
            currentBatch.add(reference);
            currentLength = jsonStr.length();
            batchIndex++;
        }

        // Process final batch if exists
        if (!currentBatch.isEmpty()) {
            processBatch(currentBatch, question, allFacts, batchIndex);
        }

        return allFacts;
    }

    private void processBatch(List<Map<String, Object>> batch, String question, List<ExtractedFact> allFacts, int batchIndex) {
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

                    // 解析JSON
                    try {
                        ExtractFactResponse factResponse = objectMapper.readValue(jsonStr, ExtractFactResponse.class);
                        if (factResponse != null && factResponse.getFacts() != null) {
                            allFacts.addAll(factResponse.getFacts());
                            logger.info("Successfully processed batch {}, extracted {} facts", 
                                batchIndex, factResponse.getFacts().size());
                            break;
                        }
                    } catch (JsonProcessingException e) {
                        logger.error("Failed to parse extracted JSON: {}", jsonStr, e);
                        if (attempt == 2) {
                            throw e;
                        }
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
    }

    /**
     * 获取指定目录下所有Markdown段落ID的有序列表
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
}
