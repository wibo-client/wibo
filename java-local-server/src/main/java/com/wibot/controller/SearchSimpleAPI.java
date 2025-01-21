package com.wibot.controller;

import com.wibot.controller.vo.SearchResultVO;
import com.wibot.controller.vo.AggregatedContentVO;
import com.wibot.index.DocumentIndexInterface;
import com.wibot.index.SearchDocumentResult;
import com.wibot.index.SimpleLocalLucenceIndex;
import com.wibot.index.search.SearchQuery;
import com.wibot.pathHandler.PathBasedIndexHandlerSelector;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import java.util.Optional;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.HashMap;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.regex.Pattern;
import java.util.regex.Matcher;

@RestController
@RequestMapping("") // 添加基础路径
public class SearchSimpleAPI {

    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(SearchSimpleAPI.class);

    @Autowired
    private PathBasedIndexHandlerSelector pathBasedIndexHandlerSelector;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @Autowired
    private MarkdownParagraphRepository markdownParagraphRepository;

    /**
     * 完整的搜索方法，支持所有搜索参数
     * 
     * @param searchParams 搜索参数
     * @return 文档片段列表
     */
    @PostMapping("/search")
    public List<SearchResultVO> search(@RequestBody Map<String, Object> searchParams) {
        String queryStr = (String) searchParams.get("queryStr");
        String pathPrefix = (String) searchParams.get("pathPrefix");
        int TopN = (int) searchParams.get("TopN");

        DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(pathPrefix);
        SearchQuery searchQuery = new SearchQuery();
        searchQuery.setOriginalQuery(queryStr);
        searchQuery.setPathPrefix(pathPrefix);
        searchQuery.setTopN(TopN);

        List<SearchDocumentResult> results = documentIndexInterface.searchWithStrategy(searchQuery);

        return results.stream().map(item -> {
            Optional<DocumentDataPO> docData = documentDataRepository
                    .findById(item.getMarkdownParagraph().getDocumentDataId());
            String url = docData.map(DocumentDataPO::getFilePath).orElse("URL not found");
            return new SearchResultVO(item.getId(), item.getTitle(), item.getHighLightContentPart(),
                    LocalDateTime.now(), url);
        }).collect(Collectors.toList());
    }

    @GetMapping("/diagnose") // 简化路径
    @ResponseBody // 确保返回值被正确处理
    public Map<String, Object> diagnoseIndex(
            @RequestParam(required = false, defaultValue = "") String pathPrefix // 使参数可选
    ) {
        Map<String, Object> response = new HashMap<>();
        try {
            DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector
                    .selectIndexHandler(pathPrefix);
            if (documentIndexInterface instanceof SimpleLocalLucenceIndex) {
                String result = ((SimpleLocalLucenceIndex) documentIndexInterface).diagnoseIndex();
                response.put("success", true);
                response.put("data", result);
            } else {
                response.put("success", false);
                response.put("error", "当前索引处理器不支持诊断功能");
            }
        } catch (Exception e) {
            logger.error("索引诊断失败", e);
            response.put("success", false);
            response.put("error", e.getMessage());
        }
        return response;
    }

    @GetMapping("/search/diagnose")
    @ResponseBody
    public Map<String, Object> diagnoseSearch(
            @RequestParam String query,
            @RequestParam(required = false) String pathPrefix) {
        Map<String, Object> response = new HashMap<>();
        try {
            // 添加编码处理
            String decodedQuery = URLDecoder.decode(query, StandardCharsets.UTF_8.name());

            DocumentIndexInterface indexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(pathPrefix);
            if (indexInterface instanceof SimpleLocalLucenceIndex) {
                String diagnosis = ((SimpleLocalLucenceIndex) indexInterface).searchDiagnose(decodedQuery);
                response.put("success", true);
                response.put("diagnosis", diagnosis);
            } else {
                response.put("success", false);
                response.put("error", "Unsupported index type");
            }
        } catch (Exception e) {
            response.put("success", false);
            response.put("error", e.getMessage());
        }
        return response;
    }

    private SearchQuery buildSearchQuery(Map<String, Object> searchParams) {
        SearchQuery searchQuery = new SearchQuery();
        @SuppressWarnings("unchecked")
        Map<String, Object> queryMap = (Map<String, Object>) searchParams.get("query");
        @SuppressWarnings("unchecked")
        List<String> exactPhrases = queryMap != null ? (List<String>) queryMap.get("exactPhrases") : new ArrayList<>();
        @SuppressWarnings("unchecked")
        List<String> requiredTerms = queryMap != null ? (List<String>) queryMap.get("requiredTerms")
                : new ArrayList<>();
        @SuppressWarnings("unchecked")
        List<String> optionalTerms = queryMap != null ? (List<String>) queryMap.get("optionalTerms")
                : new ArrayList<>();

        String originalQuery = queryMap != null ? String.valueOf(queryMap.get("originalQuery")) : "";
        String pathPrefix = (String) searchParams.get("pathPrefix");

        String topNStr = String.valueOf(searchParams.get("TopN"));
        Integer topN;
        try {
            topN = Integer.valueOf(topNStr);
        } catch (NumberFormatException e) {
            topN = 0; // 默认值
            logger.warn("Invalid TopN value: {}, using default 0", topNStr);
        }

        searchQuery.setExactPhrases(exactPhrases);
        searchQuery.setRequiredTerms(requiredTerms);
        searchQuery.setOptionalTerms(optionalTerms);
        searchQuery.setPathPrefix(pathPrefix);
        searchQuery.setOriginalQuery(originalQuery);

        if (topN != null) {
            searchQuery.setTopN(topN);
        }

        // 处理最近 N 天的参数
        if (searchParams.containsKey("lastNDays")) {
            int lastNDays = Integer.parseInt(String.valueOf(searchParams.get("lastNDays")));
            searchQuery.setLastNDays(lastNDays);
        }

        return searchQuery;
    }

    @PostMapping("/searchWithStrategy")
    public List<SearchResultVO> searchWithStrategy(@RequestBody Map<String, Object> searchParams) {
        try {
            // 构建 SearchQuery 对象
            SearchQuery searchQuery = buildSearchQuery(searchParams);

            // 获取索引处理器
            DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector
                    .selectIndexHandler(searchQuery.getPathPrefix());
            List<SearchDocumentResult> results = documentIndexInterface
                    .searchWithStrategy(searchQuery);

            // 转换结果
            return results.stream().map(item -> {
                Optional<DocumentDataPO> docData = documentDataRepository
                        .findById(item.getMarkdownParagraph().getDocumentDataId());
                String url = docData.map(DocumentDataPO::getFilePath).orElse("URL not found");
                return new SearchResultVO(item.getId(), item.getTitle(), item.getHighLightContentPart(),
                        LocalDateTime.now(), url);
            }).collect(Collectors.toList());

        } catch (Exception e) {
            logger.error("多策略搜索失败", e);
            return new ArrayList<>();
        }
    }

    /**
     * 聚合内容
     * 
     * @param summaryList 摘要列表
     * @return 聚合后的内容
     */
    @PostMapping("/fetchAggregatedContent")
    public List<AggregatedContentVO> fetchAggregatedContent(@RequestBody Map<String, Object> requestBody) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> summaryList = (List<Map<String, Object>>) requestBody.get("summaryList");

        return summaryList.stream().map(item -> {
            Object idObj = item.get("id");
            if (idObj == null) {
                throw new IllegalArgumentException("ID cannot be null");
            }
            Long id = Long.valueOf(idObj.toString()); // 修复类型转换问题
            String title = (String) item.get("title");
            String description = (String) item.get("description");
            LocalDateTime date = LocalDateTime.parse((String) item.get("date"));
            String url = (String) item.get("url");

            MarkdownParagraphPO paragraph = getParagraphById(id);
            return new AggregatedContentVO(id, title, description, date, url, paragraph.getContent(),
                    paragraph.getParagraphOrder());
        }).collect(Collectors.toList());
    }

    /**
     * 获取所有可能路径
     * 
     * @return 可能的路径列表
     */
    @PostMapping("/getAllPaths")
    public List<String> getAllPaths() {
        List<DocumentDataPO> allDocuments = documentDataRepository
                .findByProcessedState(DocumentDataPO.PROCESSED_STATE_FILE_INDEXED);

        // 首先计算每个层级的目录数量
        Map<Integer, Set<String>> levelPaths = new HashMap<>();

        for (DocumentDataPO doc : allDocuments) {
            String[] parts = doc.getFilePath().split("/");
            StringBuilder currentPath = new StringBuilder();

            for (int i = 0; i < parts.length; i++) {
                if (!parts[i].isEmpty()) {
                    currentPath.append("/").append(parts[i]);
                    levelPaths.computeIfAbsent(i + 1, k -> new HashSet<>())
                            .add(currentPath.toString());
                }
            }
        }

        // 找到最适合的目录层级（接近5000个子目录的最小层级）
        AtomicInteger targetLevel = new AtomicInteger(1);
        for (Map.Entry<Integer, Set<String>> entry : levelPaths.entrySet()) {
            if (entry.getValue().size() > 5000) {
                break;
            }
            targetLevel.set(entry.getKey());
        }

        // 使用确定的层级重新生成路径列表
        return allDocuments.stream()
                .map(doc -> {
                    String[] parts = doc.getFilePath().split("/");
                    StringBuilder processedPath = new StringBuilder();
                    for (int i = 0; i < Math.min(targetLevel.get(), parts.length); i++) {
                        if (!parts[i].isEmpty()) {
                            processedPath.append("/").append(parts[i]);
                        }
                    }
                    return processedPath.toString();
                })
                .filter(path -> !path.isEmpty())
                .distinct()
                .collect(Collectors.toList());
    }

    @PostMapping("/fetchDocumentContent")
    public List<SearchResultVO> fetchDocumentContent(@RequestBody Map<String, Object> requestParams) {
        String pathPrefix = String.valueOf(requestParams.get("pathPrefix"));

        // 处理带有通配符的路径
        List<DocumentDataPO> documentDataList;
        if (pathPrefix.contains("*")) {
            documentDataList = findDocumentsWithWildcard(pathPrefix);
        } else {
            Optional<DocumentDataPO> documentDataOpt = documentDataRepository.findByFilePath(pathPrefix);
            if (documentDataOpt.isEmpty()) {
                logger.error("Document not found for pathPrefix: " + pathPrefix);
                return new ArrayList<>();
            }
            documentDataList = List.of(documentDataOpt.get());
        }

        List<SearchResultVO> searchResults = new ArrayList<>();
        for (DocumentDataPO documentData : documentDataList) {
            Long documentDataId = documentData.getId();
            String title = documentData.getFileName();

            List<MarkdownParagraphPO> paragraphs = markdownParagraphRepository.findByDocumentDataId(documentDataId);

            searchResults.addAll(paragraphs.stream().map(paragraph -> {
                return new SearchResultVO(paragraph.getId(), title, "",
                        paragraph.getCreatedDateTime(), documentData.getFilePath());
            }).collect(Collectors.toList()));
        }

        return searchResults;
    }

    private List<DocumentDataPO> findDocumentsWithWildcard(String pathPrefix) {    
        //for h2 only
        String sqlPattern = pathPrefix.replace("\\", "\\\\").replace("*", "%");
  
        return documentDataRepository.findByFilePathLike(sqlPattern);
    }

    private MarkdownParagraphPO getParagraphById(Long id) {
        Optional<MarkdownParagraphPO> paragraph = markdownParagraphRepository.findById(id);
        if (paragraph.isPresent()) {
            return paragraph.get();
        } else {
            logger.error("Paragraph not found: " + id);
            return new MarkdownParagraphPO();
        }

    }
}
