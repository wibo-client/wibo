package com.wibot.index;

import com.wibot.index.builder.DocumentBuilder;

public interface LocalIndexBuilder {
    /**
     * 插入或更新索引
     * @param builder 文档构建器
     * @return 操作结果描述
     */
    String insertOrUpdateByParagraphId(DocumentBuilder builder);
    
    /**
     * 根据段落ID删除索引
     * @param paragraphId 段落ID
     * @return 操作是否成功
     */
    boolean deleteByParagraphId(String paragraphId);
}
