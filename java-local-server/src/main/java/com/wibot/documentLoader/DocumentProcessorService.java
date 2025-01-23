package com.wibot.documentLoader;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.stereotype.Service;

import com.wibot.documentLoader.event.DocumentEventListener;
import com.wibot.documentLoader.event.DocumentProcessEvent;
import com.wibot.documentParser.DocumentParserInterface;
import com.wibot.documentParserSelector.DocumentParserSelectorInterface;

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
import java.util.ArrayList;
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
    private MarkdownParagraphRepository markdownParagraphRepository;

    @Autowired
    private DocumentIndexService documentIndexService;

    private final ExecutorService executorService;

    private final List<DocumentEventListener> listeners = new ArrayList<>();

    public DocumentProcessorService() {
        ThreadFactory threadFactory = new ThreadFactoryBuilder().setNameFormat("doc-processor-%d").build();
        this.executorService = Executors.newFixedThreadPool(CORE_POOL_SIZE, threadFactory);

    }

    public void addListener(DocumentEventListener listener) {
        listeners.add(listener);
    }

    private void notifyListeners(DocumentProcessEvent event) {
        listeners.forEach(listener -> {
            try {
                listener.onDocumentProcessed(event);
            } catch (Exception e) {
                logger.error("Error notifying listener", e);
            }
        });
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
        try {
            Thread.sleep(10000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        DocumentDataPO currentDoc = null;
        while (true) {
            try {
                logger.debug("Thread {} (Processor {}) starts looking for unprocessed tasks",
                        Thread.currentThread().getName(), processorId);

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
                    logger.debug("Thread {} (Processor {}) found no tasks, sleeping for 10 seconds",
                            Thread.currentThread().getName(), processorId);
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
                        logger.debug("Thread {} (Processor {}) successfully processed document: {}",
                                Thread.currentThread().getName(), processorId,
                                document.getFilePath());
                        document.setProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_INDEXED);
                    } else {
                        logger.error("Thread {} (Processor {}) failed to process document: {}",
                                Thread.currentThread().getName(), processorId,
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

                logger.atError()
                        .setMessage("Thread {} (Processor {}) encountered an error while processing document: {}")
                        .addArgument(Thread.currentThread().getName())
                        .addArgument(processorId)
                        .addArgument(currentDoc != null ? currentDoc.getFilePath() : "Unknown document")
                        .setCause(e)
                        .log();
            }

        }
    }

    private void processDeletedDocument(DocumentDataPO document) {
        String threadName = Thread.currentThread().getName();
        logger.info("Thread {} starts processing deleted document: {}", threadName, document.getFileName());

        try {
            // 删除前通知
            notifyListeners(new DocumentProcessEvent(document, DocumentProcessEvent.TYPE_BEFORE_DELETE));

            // 1. 删除索引
            List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository.findByDocumentDataId(document.getId());
            documentIndexService.deleteParagraphsIndex(paragraphs);
            logger.debug("Thread {} completed all paragraph index deletions for document: {}",
                    threadName, document.getFilePath());

            // 2. 删除markdown段落数据
            markdownParagraphRepository.deleteByDocumentDataId(document.getId());
            logger.debug("Thread {} completed markdown paragraph deletion: {}", threadName, document.getId());

            // 3. 删除markdown内容
            markdownRepo.deleteByDocumentDataId(document.getId());
            logger.debug("Thread {} completed markdown content deletion: {}", threadName, document.getId());

            // 4. 最后删除文档数据
            documentDataRepository.delete(document);
            logger.info("Thread {} completed document deletion: {}", threadName, document.getFileName());

            // 删除后通知
            notifyListeners(new DocumentProcessEvent(document, DocumentProcessEvent.TYPE_AFTER_DELETE));

        } catch (Exception e) {
            logger.error("Thread {} failed to process deleted document: {}", threadName, document.getFilePath(), e);
            throw new RuntimeException("Failed to process deleted document", e);
        }
    }

    private List<MarkdownParagraphPO> updateDocumentParagraphs(String markdown, Long documentId,
            Long markdownContentId) {
        // 1. 删除旧段落
        List<MarkdownParagraphPO> oldParagraphs = markdownParagraphRepository.findByDocumentDataId(documentId);
        documentIndexService.deleteParagraphsIndex(oldParagraphs);

        // 2. 创建新段落
        List<MarkdownParagraphPO> newParagraphs = MarkdownBasedContentPO
                .splitContentIntoParagraphs(markdown, documentId, markdownContentId);

        // 3. 保存新段落到数据库
        return newParagraphs.stream()
                .map(markdownParagraphRepository::save)
                .toList();
    }

    private boolean processDocument(DocumentDataPO document) {
        String threadName = Thread.currentThread().getName();
        logger.info("Thread {} starts processing document: {}", threadName, document.getFileName());

        int retryCount = 0;
        while (retryCount < MAX_RETRY_ATTEMPTS) {
            try {
                if (retryCount > 0) {
                    logger.info("Thread {} retrying document processing attempt {}: {}",
                            threadName, retryCount, document.getFileName());
                    Thread.sleep(RETRY_DELAY_MS * retryCount);
                }

                // 修改前通知
                notifyListeners(new DocumentProcessEvent(document, DocumentProcessEvent.TYPE_BEFORE_MODIFY));

                // 1. 解析文档
                DocumentParserInterface parser = selector.select(document.getExtension());
                String markdown = parser.parseDocument(document);

                // 2. 保存Markdown内容
                MarkdownBasedContentPO markdownAfter = saveMarkdownContent(document, markdown);

                // 3. 更新段落
                List<MarkdownParagraphPO> paragraphs = updateDocumentParagraphs(
                        markdown, document.getId(), markdownAfter.getId());

                // 4. 构建索引
                boolean success = documentIndexService.buildDocumentIndex(
                        document.getFilePath(),
                        paragraphs,
                        document.getCreateTime());

                // 修改后通知
                notifyListeners(new DocumentProcessEvent(document, DocumentProcessEvent.TYPE_AFTER_MODIFY));

                return success;

            } catch (Exception e) {
                retryCount++;
                if (retryCount >= MAX_RETRY_ATTEMPTS) {
                    logger.error("Thread {} failed to process document after {} attempts: {}",
                            threadName, retryCount, document.getFilePath(), e);
                    return false;
                }
                logger.warn("Thread {} failed to process document, preparing for retry attempt {}: {}",
                        threadName, retryCount + 1, document.getFilePath(), e);
            }
        }
        return false;
    }

    // 辅助方法：保存Markdown内容
    private MarkdownBasedContentPO saveMarkdownContent(DocumentDataPO document, String markdown) {
        Optional<MarkdownBasedContentPO> existingContent = markdownRepo.findByDocumentDataId(document.getId());
        if (existingContent.isPresent()) {
            MarkdownBasedContentPO content = existingContent.get();
            content.setContent(markdown);
            content.setCreatedDateTime(LocalDateTime.now());
            return markdownRepo.save(content);
        } else {
            MarkdownBasedContentPO content = new MarkdownBasedContentPO();
            content.setCreatedDateTime(LocalDateTime.now());
            content.setDocumentDataId(document.getId());
            content.setContent(markdown);
            return markdownRepo.save(content);
        }
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
