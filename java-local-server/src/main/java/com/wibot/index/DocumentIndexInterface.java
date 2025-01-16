package com.wibot.index;

import java.util.List;

import com.wibot.index.search.SearchQuery;

/**
 * 文档索引接口，提供文档索引构建和搜索功能
 */
public interface DocumentIndexInterface {

    String getInterfaceDescription();

    List<String> getPossiblePath(String path);

    /**
     * 基础搜索方法，使用默认的搜索结果数量限制
     * 
     * @param query 搜索关键词
     * @return 文档片段列表
     */
    List<SearchDocumentResult> search(String query);

    /**
     * 带结果数量限制的搜索方法
     * 
     * @param query 搜索关键词
     * @param TopN  返回结果的最大数量
     * @return 文档片段列表
     */
    List<SearchDocumentResult> search(String query, int TopN);

    /**
     * 支持用户筛选和路径前缀的搜索方法
     * 
     * @param queryStr   搜索关键词
     * @param userId     用户ID，用于筛选特定用户的文档
     * @param pathPrefix 文件路径前缀，用于筛选特定目录下的文档
     * @return 文档片段列表
     */
    List<SearchDocumentResult> search(String queryStr, String pathPrefix);

    /**
     * 完整的搜索方法，支持所有搜索参数
     * 
     * @param queryStr   搜索关键词
     * @param userId     用户ID，用于筛选特定用户的文档
     * @param pathPrefix 文件路径前缀，用于筛选特定目录下的文档
     * @param TopN       返回结果的最大数量
     * @return 文档片段列表
     */
    List<SearchDocumentResult> search(String queryStr, String pathPrefix, int TopN);

    public List<SearchDocumentResult> searchWithStrategy(SearchQuery searchQuery);

}