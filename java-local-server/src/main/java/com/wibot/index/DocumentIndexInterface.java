package com.wibot.index;

import java.util.List;

import com.wibot.index.search.SearchQuery;

/**
 * 文档索引接口，提供文档索引构建和搜索功能
 */
public interface DocumentIndexInterface {

    String getInterfaceDescription();

    // List<String> getPossiblePath(String path);

    public List<SearchDocumentResult> searchWithStrategy(SearchQuery searchQuery);

}