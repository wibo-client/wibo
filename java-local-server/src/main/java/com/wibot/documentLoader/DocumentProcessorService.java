package com.wibot.documentLoader;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Service;

import com.wibot.documentParser.DocumentParserInterface;
import com.wibot.documentParserSelector.DocumentParserSelectorInterface;
import com.wibot.index.LocalIndexBuilder;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownBasedContentRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownBasedContentPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import com.google.common.util.concurrent.ThreadFactoryBuilder;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.*;

@Service
@EnableScheduling
public class DocumentProcessorService {
    private static final Logger logger = LoggerFactory.getLogger(DocumentProcessorService.class);

    private static final int CORE_POOL_SIZE = 4;
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long RETRY_DELAY_MS = 1000; // 1秒重试间隔

    @Autowired
    private DocumentDataRepository documentDataRepository;
    @Autowired
    private DocumentParserSelectorInterface selector;
    @Autowired
    private MarkdownBasedContentRepository markdownRepo;
    @Autowired
    private LocalIndexBuilder index;

    @Autowired
    private MarkdownParagraphRepository markdownParagraphRepository;

    private final ExecutorService executorService;

    public DocumentProcessorService() {
        ThreadFactory threadFactory = new ThreadFactoryBuilder().setNameFormat("doc-processor-%d").build();
        this.executorService = Executors.newFixedThreadPool(CORE_POOL_SIZE, threadFactory);

    }

    @PostConstruct
    public void startProcessing() {
        for (int i = 0; i < CORE_POOL_SIZE; i++) {
            final int processorId = i;
            executorService.submit(() -> {
                Thread.currentThread().setName("doc-processor-" + processorId);

                processDocuments(processorId);
            });
        }
    }

    private void processDocuments(int processorId) {
        DocumentDataPO currentDoc = null;
        while (true) {
            try {
                logger.debug("线程 {} (处理器 {}) 开始查找未处理的任务", Thread.currentThread().getName(), processorId);

                // 查找未处理的任务，包括新文件和已删除文件
                List<DocumentDataPO> allDocuments = documentDataRepository
                        .findByProcessedStateInOrderById(
                                Arrays.asList(DocumentDataPO.PROCESSED_STATE_FILE_SAVED,
                                        DocumentDataPO.PROCESSED_STATE_DELETED),
                                PageRequest.of(0, 50 * CORE_POOL_SIZE));

                // 在Java中进行hash分桶
                List<DocumentDataPO> documents = allDocuments.stream()
                        .filter(doc -> Math.abs(doc.getFileName().hashCode()) % CORE_POOL_SIZE == processorId).limit(10)
                        .toList();

                if (documents.isEmpty()) {
                    logger.debug("线程 {} (处理器 {}) 未找到任务，休眠10秒", Thread.currentThread().getName(), processorId);
                    Thread.sleep(10000);
                    continue;
                }

                for (DocumentDataPO document : documents) {

                    // 处理已删除的文件
                    if (DocumentDataPO.PROCESSED_STATE_DELETED.equals(document.getProcessedState())) {
                        processDeletedDocument(document);
                        continue;
                    }
                    currentDoc = document;
                    boolean success = processDocument(document);
                    if (success) {
                        logger.debug("线程 {} (处理器 {}) 处理文档成功: {}", Thread.currentThread().getName(), processorId,
                                document.getFilePath());
                        document.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_INDEXED);
                    } else {
                        logger.error("线程 {} (处理器 {}) 处理文档失败: {}", Thread.currentThread().getName(), processorId,
                                document.getFilePath());
                        document.setProcessedState(DocumentDataPO.PROCESSED_ERROR);
                    }
                    documentDataRepository.save(document);
                    // try {
                    // Thread.sleep(100);
                    // } catch (InterruptedException e) {
                    // Thread.currentThread().interrupt();
                    // }
                }
            } catch (Exception e) {
                logger.error("线程 {} (处理器 {}) 处理{}文档时出错", Thread.currentThread().getName(), processorId, currentDoc, e);
            }

        }
    }

    private void processDeletedDocument(DocumentDataPO document) {
        String threadName = Thread.currentThread().getName();
        logger.info("线程 {} 开始处理已删除文档: {}", threadName, document.getFileName());

        try {
            // 1. 删除索引
            index.deleteIndex(document.getFilePath());
            logger.debug("线程 {} 删除索引完成: {}", threadName, document.getFilePath());

            // 2. 删除markdown段落数据
            markdownParagraphRepository.deleteByDocumentDataId(document.getId());
            logger.debug("线程 {} 删除markdown段落数据完成: {}", threadName, document.getId());

            // 3. 删除markdown内容
            markdownRepo.deleteByDocumentDataId(document.getId());
            logger.debug("线程 {} 删除markdown内容完成: {}", threadName, document.getId());

            // 4. 最后删除文档数据
            documentDataRepository.delete(document);
            logger.info("线程 {} 文档删除处理完成: {}", threadName, document.getFileName());

        } catch (Exception e) {
            logger.error("线程 {} 处理删除文档失败: {}", threadName, document.getFilePath(), e);
            throw new RuntimeException("处理删除文档失败", e);
        }
    }

    private boolean processDocument(DocumentDataPO document) {
        String threadName = Thread.currentThread().getName();
        logger.info("线程 {} 开始处理文档: {}", threadName, document.getFileName());

        int retryCount = 0;
        while (retryCount < MAX_RETRY_ATTEMPTS) {
            try {
                if (retryCount > 0) {
                    logger.info("线程 {} 正在进行第 {} 次重试处理文档: {}", threadName, retryCount, document.getFileName());
                    Thread.sleep(RETRY_DELAY_MS * retryCount); // 递增重试延迟
                }

                DocumentParserInterface parser = selector.select(document.getExtension());
                logger.debug("线程 {} 选择的解析器: {}", threadName, parser.getClass().getName());

                String markdown = parser.parseDocument(document);
                logger.debug("线程 {} 解析后的Markdown内容长度: {}", threadName, markdown.length());
                MarkdownBasedContentPO markdownAfter;
                Optional<MarkdownBasedContentPO> existingContent = markdownRepo.findByDocumentDataId(document.getId());
                if (existingContent.isPresent()) {
                    // 更新现有记录
                    MarkdownBasedContentPO content = existingContent.get();

                    content.setContent(markdown);
                    content.setCreatedDateTime(LocalDateTime.now());
                    markdownAfter = markdownRepo.save(content);

                } else {
                    // 插入新记录
                    MarkdownBasedContentPO content = new MarkdownBasedContentPO();
                    content.setCreatedDateTime(LocalDateTime.now());
                    content.setDocumentDataId(document.getId());
                    content.setContent(markdown);
                    content.setCreatedDateTime(LocalDateTime.now());
                    markdownAfter = markdownRepo.save(content);
                }

                // 创建并保存文档索引
                logger.debug("线程 {} 创建文档索引", threadName);
                String filePath = document.getFilePath();

                logger.debug("线程 {} 删除已有的索引: {}", threadName, filePath);
                index.deleteIndex(filePath);

                List<MarkdownParagraphPO> markdownParagraphs = MarkdownBasedContentPO
                        .splitContentIntoParagraphs(markdown, document.getId(), markdownAfter.getId());

                for (MarkdownParagraphPO paragraph : markdownParagraphs) {
                    paragraph = markdownParagraphRepository.save(paragraph);
                    String paragraphId = String.valueOf(paragraph.getId());
                    String documentDataId = String.valueOf(paragraph.getDocumentDataId());
                    logger.debug("线程 {} 保存{} 的 段落索引: {}", threadName, documentDataId, paragraphId);
                    try {
                        index.buildIndex(paragraphId, filePath, paragraph.getContent());
                    } catch (Exception e) {
                        logger.error("线程 {} 保存段落索引失败: {}", threadName, paragraphId, e);
                        // 处理保存段落索引失败的情况
                    }
                }

                return true; // 处理成功则直接返回

            } catch (Exception e) {
                retryCount++;
                if (retryCount >= MAX_RETRY_ATTEMPTS) {
                    logger.error("线程 {} 处理文档失败，已重试 {} 次: {}", threadName, retryCount, document.getFilePath(), e);
                    return false;
                } else {
                    logger.warn("线程 {} 处理文档失败，准备第 {} 次重试: {}", threadName, retryCount + 1, document.getFilePath(), e);
                }
            }
        }
        return false;
    }

    @PreDestroy
    public void shutdown() {
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
}
