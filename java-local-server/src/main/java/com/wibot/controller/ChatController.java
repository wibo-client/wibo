package com.wibot.controller;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.ChatClient.StreamResponseSpec;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.prompt.PromptTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.wibot.controller.vo.RequestData;
import com.wibot.controller.vo.SearchResult;
import com.wibot.index.DocumentIndexInterface;
import com.wibot.index.SearchDocumentResult;
import com.wibot.index.analyzerKW.SearchEngineAnalyzer;
import com.wibot.index.search.SearchQuery;
import com.wibot.pathHandler.PathBasedIndexHandlerSelector;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownBasedContentRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;
import com.wibot.rerank.DocumentRerankInterface;
import com.wibot.service.SingletonLLMChat;

import jakarta.servlet.http.HttpServletResponse;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import org.springframework.http.HttpStatus;

@RestController
public class ChatController {
    public final int MAX_BATCH_SIZE_5000 = 28720;
    private static final Logger logger = LoggerFactory.getLogger(ChatController.class);
    private static final String SEARCH_ONLY = "search";
    private static final String CHAT_ONLY = "chat";
    private static final String SEARCH_AND_CHAT = "searchAndChat";
    private static final String SEARCH_WITH_RERANK = "searchWithRerank";
    @Value("classpath:/prompts/ragPrompt.st")
    private Resource userPrompt;

    // private String filePath
    @Autowired
    @Qualifier("LLMBasedAnalyzerQuoted")
    private SearchEngineAnalyzer searchEngineAnalyzer;

    @Autowired
    private SingletonLLMChat singletonLLMChat;

    @Autowired
    private PathBasedIndexHandlerSelector pathBasedIndexHandlerSelector;

    @Autowired
    private DocumentRerankInterface documentRerankInterface;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    @PostMapping("/chat/stream")
    public Flux<ServerSentEvent<String>> stream(@RequestBody RequestData requestData, HttpServletResponse response) {
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-cache");
        response.setHeader("Connection", "keep-alive");

        String input = requestData.getInput();
        String type = requestData.getType();
        String path = requestData.getPath();

        logger.info("Received request with input: {}, type: {}, path: {}", input, type, path);

        Flux<String> result;
        if (SEARCH_ONLY.equals(type)) {
            // .concatWith(Flux.just("[END]"))
            result = search(input, path);
        } else if (CHAT_ONLY.equals(type)) {
            result = chat(input, path);
        } else if (SEARCH_AND_CHAT.equals(type)) {
            result = searchAndChat(input, path);
        } else if (SEARCH_WITH_RERANK.equals(type)) {
            result = searchWithRerank(input, path);
        } else {
            logger.info("Invalid type received: {}", type);
            result = Flux.just("Invalid type");
        }
        return result.map(data -> ServerSentEvent.builder(data).build()).onErrorResume(WebClientResponseException.class,
                ex -> {
                    if (ex.getStatusCode() == HttpStatus.UNAUTHORIZED) {
                        return Flux.just(ServerSentEvent.builder("Unauthorized: 请在右上角的 【管理界面】 中输入阿里云的大模型AK").build());
                    }
                    return Flux.error(ex);
                });
    }

    public Flux<String> search(String input, String path) {
        logger.info("Starting search for input: {}", input);

        DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(path);
        SearchQuery searchQuery = new SearchQuery();
        searchQuery.setOriginalQuery(input);
        searchQuery.setPathPrefix(path);
        searchQuery.setTopN(20);

        List<SearchDocumentResult> documentPartList = documentIndexInterface.searchWithStrategy(searchQuery);
        List<SearchResult> searchResults = processDocumentPartList(documentPartList, 10);

        logger.info("Search completed. Found {} results.", searchResults.size());

        // 拼接所有搜索结果
        String resultString = buildSearchResultsString(searchResults);

        return Flux.just(resultString);
    }

    public Flux<String> searchWithRerank(String input, String path) {
        logger.info("Starting search with rerank for input: {}", input);
        DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(path);

        String analyzerTokens = searchEngineAnalyzer.analyze(input);
        String tempSearchInput = analyzerTokens + " " + input;

        SearchQuery searchQuery = new SearchQuery();
        searchQuery.setOriginalQuery(tempSearchInput);
        searchQuery.setPathPrefix(path);
        searchQuery.setTopN(20);

        List<SearchDocumentResult> documentPartList = documentIndexInterface.searchWithStrategy(searchQuery);
        List<SearchDocumentResult> rerankedDocumentPartList = documentRerankInterface.rerank(documentPartList, input);
        List<SearchResult> searchResults = processDocumentPartList(rerankedDocumentPartList, 10);

        logger.info("Search with rerank completed. Found {} results.", searchResults.size());

        // 拼接所有搜索结果
        String resultString = buildSearchResultsString(searchResults);

        return Flux.just(resultString);
    }

    private List<SearchResult> processDocumentPartList(List<SearchDocumentResult> documentPartList, int limit) {
        List<SearchResult> searchResults = new ArrayList<>();
        int count = limit;

        for (SearchDocumentResult documentPart : documentPartList) {
            String title = documentPart.getTitle();
            String highLightContentPart = documentPart.getHighLightContentPart();

            searchResults.add(new SearchResult(title, highLightContentPart));
            if (count-- <= 0) {
                break;
            }
        }

        return searchResults;
    }

    private String buildSearchResultsString(List<SearchResult> searchResults) {
        StringBuilder sb = new StringBuilder();
        AtomicInteger fileNumber = new AtomicInteger(1);
        searchResults.forEach(result -> {
            sb.append("## file index:").append(fileNumber.getAndIncrement()).append("\n");
            sb.append("### File Path \n");
            sb.append(result.getFilePath()).append("\n");
            sb.append("### Highlight \n");
            sb.append("```\n"); // 开始代码块
            sb.append(result.getHighLightContentPart()).append("\n");
            sb.append("```\n"); // 结束代码块
        });
        return sb.toString();
    }

    public Flux<String> chat(String input, String path) {
        logger.info("Starting chat for input: {}", input);

        Prompt prompt = new Prompt(input);
        StreamResponseSpec spec = singletonLLMChat.getChatClient().prompt(prompt).stream();
        Flux<String> returnStream = spec.content();

        logger.info("Chat completed for input: {}", input);

        return returnStream;
    }

    public Flux<String> searchAndChat(String input, String path) {
        logger.info("Starting search and chat for input: {}", input);

        try {
            // 1. 搜索相关文档
            DocumentIndexInterface documentIndexInterface = pathBasedIndexHandlerSelector.selectIndexHandler(path);

            SearchQuery searchQuery = new SearchQuery();
            searchQuery.setOriginalQuery(input);
            searchQuery.setPathPrefix(path);
            searchQuery.setTopN(40);

            List<SearchDocumentResult> documentPartList = documentIndexInterface.searchWithStrategy(searchQuery);
            List<SearchDocumentResult> rerankedDocumentPartList = documentRerankInterface.rerank(documentPartList,
                    input);

            // 2. 构建上下文内容
            StringBuilder contextBuilder = new StringBuilder();
            int currentLength = 0;
            int partIndex = 1;
            // 限制最大结果数
            List<DocumentDataPO> referDocs = new ArrayList<>();
            final int limit = 100;
            int maxResults = limit;

            for (SearchDocumentResult doc : rerankedDocumentPartList) {
                if (maxResults-- <= 0) {
                    break;
                }

                Long documentId = doc.getId();

                MarkdownParagraphPO content = doc.getMarkdownParagraph();
                if (content == null) {
                    logger.warn("Markdown content not found for document id: {}",
                            documentId + ", title: " + doc.getTitle());
                    continue;
                }
                Long documentDataId = content.getDocumentDataId();
                Optional<DocumentDataPO> docData = documentDataRepository.findById(documentDataId);
                if (!docData.isPresent()) {
                    logger.warn("Document data not found for document id: {}", documentDataId);
                    continue;
                }

                referDocs.add(docData.get());

                String filePath = docData.get().getFilePath();
                String detailedContent = content.getContent(); // 获取完整内容
                String highLightContent = doc.getHighLightContentPart();
                int paragraphOrder = content.getParagraphOrder();
                LocalDateTime createTimeStr = content.getCreatedDateTime();

                String partHeader;
                if (createTimeStr != null) {
                    partHeader = String.format("\n# 第%d篇参考内容（来自文件路径：%s 的 第 %s 段 ,发布时间是 %s）：\n\n", partIndex++, filePath,
                            String.valueOf(paragraphOrder), createTimeStr);
                } else {
                    partHeader = String.format("\n# 第%d篇参考内容（来自文件路径：%s 的 第 %s 段）：\n\n", partIndex++, filePath,
                            String.valueOf(paragraphOrder));
                }
                String combinedContent = highLightContent + "\n\n详细内容：\n" + detailedContent;

                if (currentLength + combinedContent.length() + partHeader.length() > MAX_BATCH_SIZE_5000) {
                    contextBuilder.append(
                            combinedContent.substring(0, MAX_BATCH_SIZE_5000 - currentLength - partHeader.length()));
                    logger.warn("Reached max batch size limit at document {}", documentId);
                    break;
                }

                contextBuilder.append(partHeader).append(combinedContent);
                currentLength += combinedContent.length() + partHeader.length();
                logger.debug("Added content from document {}, current length: {}", documentId, currentLength);
            }

            // 3. 构建提示信息
            List<Message> messages = new ArrayList<>();

            // 添加用户提示
            PromptTemplate promptTemplate = new PromptTemplate(userPrompt);
            Map<String, Object> arguments = new HashMap<>();
            arguments.put("suggestionContext", contextBuilder.toString());
            arguments.put("userInput", input);
            Message userMessage = promptTemplate.createMessage(arguments);
            messages.add(userMessage);

            Prompt prompt = new Prompt(messages);
            final AtomicReference<String> returnStrfinal = new AtomicReference<>();
            final List<String> collectedResults = new ArrayList<>();
            // 5. 调用模型并返回流式响应
            StreamResponseSpec spec = singletonLLMChat.getChatClient().prompt(prompt).stream();
            Flux<String> chatFlux = spec.content().doOnNext(collectedResults::add)
                    .doOnError(error -> logger.error("Error in chat stream: ", error)).doOnComplete(() -> {
                        logger.info("Search and chat completed for input: {}", input);
                        // 在流完成后处理收集到的结果
                        StringBuilder combinedOutput = new StringBuilder();

                        String lastELe = collectedResults.isEmpty() ? ""
                                : collectedResults.get(collectedResults.size() - 1);
                        logger.info("Last line of collected results: {}", lastELe);
                        combinedOutput.append(lastELe);
                        combinedOutput.append("\n\n");
                        // 添加参考文档部分
                        combinedOutput.append("## Reference Documents:\n");
                        int index = 1;
                        // referDocs 去重
                        List<DocumentDataPO> referDocsDistinct = referDocs.stream().distinct().toList();
                        for (DocumentDataPO docData : referDocsDistinct) {
                            combinedOutput.append("doc ").append(index).append(": ").append(docData.getFilePath())
                                    .append("\n");
                            combinedOutput.append("\n");
                            if ((index++) > 3) {
                                break;
                            }
                        }
                        returnStrfinal.set(combinedOutput.toString());
                        logger.info("Final combined output: {}", combinedOutput.toString());

                    });

            // 6. 返回流式响应，并在最后添加 returnStrFinal 的内容
            return chatFlux.concatWith(Mono.fromSupplier(() -> returnStrfinal.get()));

        } catch (Exception e) {
            logger.error("Error in searchAndChat: ", e);
            return Flux.error(e);
        }
    }

}