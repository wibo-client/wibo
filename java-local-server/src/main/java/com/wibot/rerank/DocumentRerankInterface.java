package com.wibot.rerank;

import java.util.List;

import com.wibot.index.SearchDocumentResult;

public interface DocumentRerankInterface {
    public List<SearchDocumentResult> rerank(List<SearchDocumentResult> documentPartList, String queryString);
}
