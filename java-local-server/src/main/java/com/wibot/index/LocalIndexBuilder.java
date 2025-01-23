package com.wibot.index;

import java.io.IOException;

import com.wibot.index.builder.DocumentBuilder;

public interface LocalIndexBuilder {
    /**
     * 插入或更新索引
     * 
     * @param builder 文档构建器
     * @return 操作结果描述
     */
    String insertOrUpdateByParagraphId(DocumentBuilder builder);

    /**
     * 根据段落ID删除索引
     * 
     * @param paragraphId 段落ID
     * @return 操作是否成功
     */
    boolean deleteByParagraphId(String paragraphId);

    /**
     * 根据提炼任务ID删除索引
     * 
     * @param taskId 任务ID
     * @throws IOException
     */
    void deleteByRefineryTaskId(Long taskId, Long paragraphId) throws IOException;
}
