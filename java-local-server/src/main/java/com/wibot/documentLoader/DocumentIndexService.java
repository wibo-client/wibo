package com.wibot.documentLoader;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.wibot.index.LocalIndexBuilder;
import com.wibot.index.builder.DocumentBuilder;
import com.wibot.persistence.entity.MarkdownParagraphPO;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class DocumentIndexService {
    private static final Logger logger = LoggerFactory.getLogger(DocumentIndexService.class);

    @Autowired
    private LocalIndexBuilder index;

    /**
     * 构建文档的索引
     * 
     * @param filePath   文件路径
     * @param paragraphs 段落列表
     * @param createTime 文档创建时间
     * @return 是否成功
     */
    public boolean buildDocumentIndex(String filePath, List<MarkdownParagraphPO> paragraphs, LocalDateTime createTime) {
        String threadName = Thread.currentThread().getName();
        boolean success = true;

        for (MarkdownParagraphPO paragraph : paragraphs) {
            try {
                String paragraphId = String.valueOf(paragraph.getId());
                logger.debug("Thread {} building index for paragraph: {}", threadName, paragraphId);

                DocumentBuilder builder = new DocumentBuilder(paragraphId)
                        .withFilePath(filePath)
                        .withContent(paragraph.getContent());

                if (createTime != null) {
                    builder.withCreateTime(createTime);
                }

                index.insertOrUpdateByParagraphId(builder);
            } catch (Exception e) {
                logger.error("Thread {} failed to build index for paragraph: {}",
                        threadName, paragraph.getId(), e);
                success = false;
            }
        }

        return success;
    }

    /**
     * 删除文档的段落索引
     * 
     * @param paragraphs 需要删除索引的段落列表
     * @return 是否全部成功删除
     */
    public boolean deleteParagraphsIndex(List<MarkdownParagraphPO> paragraphs) {
        String threadName = Thread.currentThread().getName();
        boolean success = true;

        for (MarkdownParagraphPO paragraph : paragraphs) {
            try {
                String paragraphId = String.valueOf(paragraph.getId());
                index.deleteByParagraphId(paragraphId);
                logger.debug("Thread {} deleted paragraph index: {}", threadName, paragraphId);
            } catch (Exception e) {
                logger.error("Thread {} failed to delete paragraph index: {}",
                        threadName, paragraph.getId(), e);
                success = false;
            }
        }

        return success;
    }

    /**
     * 为提炼任务构建索引文档
     * 
     * @param taskId      任务ID
     * @param fact        提取的事实
     * @param content     原始内容
     * @param filePath    文件路径
     * @param paragraphId 段落ID
     */
    public void buildRefineryTaskIndex(Long taskId, String fact, Long paragraphId) {
        String threadName = Thread.currentThread().getName();
        try {
            logger.debug("Thread {} building refinery task index for task: {}, paragraph: {}",
                    threadName, taskId, paragraphId);

            // 只保留必要的字段：文档ID、任务ID和事实内容
            DocumentBuilder builder = new DocumentBuilder(String.valueOf(paragraphId))
                    .withRefineryTask(taskId)
                    .withFact(fact);

            index.insertOrUpdateByParagraphId(builder);

        } catch (Exception e) {
            logger.error("Thread {} failed to build refinery task index for task: {}, paragraph: {}",
                    threadName, taskId, paragraphId, e);
            throw new RuntimeException("Failed to build refinery task index", e);
        }
    }

    /**
     * 删除提炼任务相关的索引
     * 
     * @param taskId 任务ID
     */
    public void deleteRefineryTaskIndex(Long taskId, Long paragraphId) {
        String threadName = Thread.currentThread().getName();
        try {
            logger.debug("Thread {} deleting refinery task index for task: {}", threadName, taskId);

            // 使用任务ID作为term进行删除
            index.deleteByRefineryTaskId(taskId, paragraphId);

        } catch (Exception e) {
            logger.error("Thread {} failed to delete refinery task index for task: {}",
                    threadName, taskId, e);
            throw new RuntimeException("Failed to delete refinery task index", e);
        }
    }
}
