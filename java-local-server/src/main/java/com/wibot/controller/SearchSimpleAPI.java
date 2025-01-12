package com.wibot.controller;

import com.wibot.controller.vo.SearchResultVO;
import com.wibot.controller.vo.AggregatedContentVO;
import com.wibot.index.DocumentIndexInterface;
import com.wibot.index.SearchDocumentResult;
import com.wibot.pathHandler.PathBasedIndexHandlerSelector;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;
import java.util.Optional;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.HashMap;
import java.util.HashSet;

@RestController
public class SearchSimpleAPI {

    @Autowired
    private PathBasedIndexHandlerSelector pathBasedIndexHandlerSelector;

    @Autowired
    private DocumentDataRepository documentDataRepository;

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
        List<SearchDocumentResult> results = documentIndexInterface.search(queryStr, pathPrefix, TopN);

        return results.stream().map(item -> {
            Optional<DocumentDataPO> docData = documentDataRepository
                    .findById(item.getMarkdownParagraph().getDocumentDataId());
            String url = docData.map(DocumentDataPO::getFilePath).orElse("URL not found");
            return new SearchResultVO(item.getId(), item.getTitle(), item.getHighLightContentPart(),
                    LocalDateTime.now(), url);
        }).collect(Collectors.toList());
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
            Long id = ((Number) item.get("id")).longValue();
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

    private MarkdownParagraphPO getParagraphById(Long id) {
        // 假设有一个方法可以通过ID获取MarkdownParagraphPO
        return new MarkdownParagraphPO();
    }
}
