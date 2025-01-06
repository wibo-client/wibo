package com.wibot.index;

public interface LocalIndexBuilder {
    /**
     * 构建文档索引
     * 
     * @param documents 需要建立索引的Markdown文档内容
     * @return 构建结果描述信息
     */
    public String buildIndex(String paragraphId, String filePath, String content);

    boolean deleteIndex(String filePath);

}
