package com.wibot.controller;

import com.wibot.controller.vo.SearchResultVO;
import com.wibot.controller.vo.AggregatedContentVO;
import com.wibot.index.DocumentIndexInterface;
import com.wibot.index.SearchDocumentResult;
import com.wibot.pathHandler.PathBasedIndexHandlerSelector;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@RestController
public class SearchSimpleAPI {

    @Autowired
    private PathBasedIndexHandlerSelector pathBasedIndexHandlerSelector;

    /**
     * 完整的搜索方法，支持所有搜索参数
     * 
     * @param queryStr   搜索关键词
     * @param pathPrefix 文件路径前缀，用于筛选特定目录下的文档
     * @param TopN       返回结果的最大数量
     * @return 文档片段列表
     */
    @GetMapping("/search")
    public List<SearchResultVO> search(@RequestParam String queryStr, @RequestParam String pathPrefix,
            @RequestParam int TopN) {
        DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(pathPrefix);
        List<SearchDocumentResult> results = documentIndexInterface.search(queryStr, pathPrefix, TopN);

        return results.stream().map(item -> new SearchResultVO(item.getId(), item.getTitle(),
                item.getHighLightContentPart(), LocalDateTime.now(), generateUrl(item.getId())))
                .collect(Collectors.toList());
    }

    /**
     * 聚合内容
     * 
     * @param summaryList 摘要列表
     * @return 聚合后的内容
     */
    @GetMapping("/fetchAggregatedContent")
    public List<AggregatedContentVO> fetchAggregatedContent(@RequestParam List<SearchResultVO> summaryList) {
        return summaryList.stream().map(item -> {
            Long id = item.getId();
            MarkdownParagraphPO paragraph = getParagraphById(id);
            return new AggregatedContentVO(item.getId(), item.getTitle(), item.getDescription(), item.getDate(),
                    item.getUrl(), paragraph.getContent(), paragraph.getParagraphOrder());
        }).collect(Collectors.toList());
    }

    /**
     * 获取可能的路径
     * 
     * @param path 路径前缀
     * @return 可能的路径列表
     */
    @GetMapping("/getPossiblePath")
    public List<String> getPossiblePath(@RequestParam String path) {
        DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(path);
        return documentIndexInterface.getPossiblePath(path);
    }

    private String generateUrl(Long id) {
        return "https://yourdomain.com/doc/" + id;
    }

    private MarkdownParagraphPO getParagraphById(Long id) {
        // 假设有一个方法可以通过ID获取MarkdownParagraphPO
        return new MarkdownParagraphPO();
    }
}
