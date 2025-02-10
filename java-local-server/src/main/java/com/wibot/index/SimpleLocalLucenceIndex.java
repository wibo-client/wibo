package com.wibot.index;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.cn.smart.SmartChineseAnalyzer;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.document.Document;
import org.apache.lucene.index.ConcurrentMergeScheduler;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.IndexableField;
import org.apache.lucene.index.Term;
import org.apache.lucene.queryparser.classic.MultiFieldQueryParser;
import org.apache.lucene.queryparser.classic.ParseException;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.PhraseQuery;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TermQuery;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.search.highlight.Highlighter;
import org.apache.lucene.search.highlight.QueryScorer;
import org.apache.lucene.search.highlight.SimpleFragmenter;
import org.apache.lucene.search.highlight.SimpleHTMLFormatter;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import com.wibot.index.builder.DocumentBuilder;
import com.wibot.index.operation.IndexOperation;
import com.wibot.index.search.SearchQuery;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;

import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.BoostQuery;
import org.apache.lucene.search.DisjunctionMaxQuery;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.PrefixQuery;
import org.apache.lucene.search.Sort;
import org.apache.lucene.search.SortField;
import org.apache.lucene.document.LongPoint;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;

import org.slf4j.*;

@Service
@Primary
public class SimpleLocalLucenceIndex implements DocumentIndexInterface, LocalIndexBuilder {
    private final static Logger logger = LoggerFactory.getLogger(SimpleLocalLucenceIndex.class);
    @Value("${app.lucene.index.path}")
    private String indexDir;
    private Directory directory;
    private Analyzer analyzer;
    private IndexWriter indexWriter;
    private int MAX_SEARCH = 30;
    private final int MAX_PENDING_DOCUMENTS = 50;

    @Autowired
    private DocumentDataRepository documentDataRepository;

    private static final Pattern SYMBOL_PATTERN = Pattern.compile("[,\\.]+");

    @Autowired
    private MarkdownParagraphRepository markdownParagraphRepository;

    private final ExecutorService executorService = Executors.newSingleThreadExecutor();
    private final List<IndexOperation> pendingOperations = new ArrayList<>();
    private final Object commitLock = new Object();

    @PostConstruct
    public void init() {
        try {
            directory = FSDirectory.open(Paths.get(indexDir));
            // 修改：使用组合分析器替代单一的StandardAnalyzer
            analyzer = new SmartChineseAnalyzer();
            IndexWriterConfig config = new IndexWriterConfig(analyzer);
            config.setRAMBufferSizeMB(256.0);
            config.setMaxBufferedDocs(1000);
            config.setMergeScheduler(new ConcurrentMergeScheduler());
            indexWriter = new IndexWriter(directory, config);
        } catch (IOException e) {
            throw new RuntimeException("初始化索引失败", e);
        }
        startCommitScheduler();
    }

    public SimpleLocalLucenceIndex() {

    }

    private void startCommitScheduler() {
        executorService.submit(() -> {
            while (true) {
                try {
                    Thread.sleep(5000);
                    commitPendingOperations();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        });
    }

    private void commitPendingOperations() {
        synchronized (commitLock) {
            if (!pendingOperations.isEmpty()) {
                try {
                    for (IndexOperation op : pendingOperations) {
                        switch (op.getType()) {
                            case INSERT:
                                indexWriter.addDocument(op.getDocument());
                                break;
                            case DELETE:
                                indexWriter.deleteDocuments(new Term("id", op.getId()));
                                break;
                        }
                    }
                    indexWriter.commit();
                    pendingOperations.clear();
                } catch (IOException e) {
                    logger.error("提交操作失败", e);
                }
            }
        }
    }

    @PreDestroy
    public void close() {
        try {
            commitPendingOperations();
            if (indexWriter != null) {
                indexWriter.close();
            }
            if (directory != null) {
                directory.close();
            }
        } catch (IOException e) {
            logger.error("关闭IndexWriter失败", e);
        }
        executorService.shutdownNow();
    }

    /**
     * 清理文本内容，将 ',', '.' 等符号替换为空格
     *
     * @param text 原始文本
     * @return 清理后的文本
     */
    private String cleanText(String text) {
        if (text == null) {
            return "";
        }
        return SYMBOL_PATTERN.matcher(text).replaceAll(" ");
    }

    /**
     * 删除索引中的文档根据ID
     *
     * @param id 文档的唯一标识符
     */
    public void deleteDocumentById(Long id) {
        try (IndexWriter writer = new IndexWriter(directory, new IndexWriterConfig(analyzer))) {
            writer.deleteDocuments(new Term("id", id.toString()));
            writer.commit();
            logger.info("已删除文档 ID: {}", id);
        } catch (IOException e) {
            logger.error("删除文档 ID: {} 失败", id, e);
        }
    }

    // 在同一文件中
    private Query parseQuery(String queryStr) {
        logger.debug("Building query for: {}", queryStr);
        String cleanedQuery = cleanText(queryStr);

        // 替换现有的 TermQuery 或 BooleanQuery 构建逻辑，使用多字段解析器:
        String[] fields = { "content" }; // 去掉 "raw_content" 字段
        MultiFieldQueryParser parser = new MultiFieldQueryParser(fields, analyzer);
        // 可选：添加模糊搜索参数（例如模糊度 2）
        parser.setFuzzyMinSim(0.7f);
        parser.setPhraseSlop(2); // 根据需要调整
        Query query = null;
        try {
            query = parser.parse(cleanedQuery + "~2");
        } catch (ParseException e) {
            e.printStackTrace();
        } // "~2" 表示模糊度或者短语搜索可选

        logger.debug("MultiField fuzzy query: {}", query);
        return query;
    }

    public List<SearchDocumentResult> search(String queryStr, String pathPrefix, int TopN) {
        try {
            List<SearchDocumentResult> results = new ArrayList<>();
            try (DirectoryReader reader = DirectoryReader.open(directory)) {
                IndexSearcher searcher = new IndexSearcher(reader);

                // 构建组合查询
                BooleanQuery.Builder booleanQuery = new BooleanQuery.Builder();

                // 内容查询
                Query contentQuery = parseQuery(queryStr);
                booleanQuery.add(contentQuery, BooleanClause.Occur.MUST);

                // 路径前缀过滤
                if (pathPrefix != null && !pathPrefix.isEmpty()) {
                    Query pathQuery = new PrefixQuery(new Term("file_path", pathPrefix));
                    booleanQuery.add(pathQuery, BooleanClause.Occur.MUST);
                }

                // 执行搜索
                TopDocs topDocs = searcher.search(booleanQuery.build(), TopN);

                // 设置高亮
                SimpleHTMLFormatter formatter = new SimpleHTMLFormatter("<em>", "</em>");
                QueryScorer scorer = new QueryScorer(contentQuery);
                Highlighter highlighter = new Highlighter(formatter, scorer);
                highlighter.setTextFragmenter(new SimpleFragmenter(300));
                highlighter.setMaxDocCharsToAnalyze(50000);

                int index = 0;
                // 修改这里：删除 StoredFields 的使用
                for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
                    // 直接使用 searcher.doc() 替代 storedFields.document()
                    Document doc = searcher.doc(scoreDoc.doc);

                    if (index == 0) {
                        logger.debug("First document ID: {}", doc.get("id"));
                        logger.debug("First document file path: {}", doc.get("file_path"));
                        logger.debug("First document summary: {}", doc.get("summary"));
                        logger.debug("First document content: {}", doc.get("content"));
                    }
                    SearchDocumentResult part = new SearchDocumentResult();
                    String idStr = doc.get("id");
                    if (idStr != null && !idStr.equals("null")) {
                        part.setId(Long.parseLong(idStr));
                    } else {
                        logger.error("文档ID为空");
                        continue;
                    }
                    Long documentId = part.getId();
                    Optional<MarkdownParagraphPO> markdownParagraph = markdownParagraphRepository.findById(documentId);
                    markdownParagraph.ifPresent(content -> {
                        Long documentDataId = content.getDocumentDataId();
                        Optional<DocumentDataPO> documentData = documentDataRepository.findById(documentDataId);
                        documentData.ifPresent(data -> {
                            part.setTitle(data.getFilePath());
                        });
                        part.setMarkdownParagraph(content);
                    });
                    part.setScore(scoreDoc.score);

                    String content = doc.get("content");
                    String snippet;
                    if (content != null && !content.isEmpty()) {
                        try {
                            snippet = highlighter.getBestFragment(analyzer, "content", content);
                        } catch (Exception e) {
                            snippet = content.substring(0, Math.min(content.length(), 150));
                            logger.warn("高亮处理失败，使用默认片段: {}", e.getMessage());
                        }
                    } else {
                        snippet = "No content available";
                    }
                    part.setHighLightContentPart(snippet != null ? snippet : "No match found");

                    results.add(part);
                }
            } catch (Exception e) {
                logger.error("搜索失败: {}", queryStr, e);
            }
            return results;
        } catch (Exception e) {
            logger.error("搜索失败: {}", queryStr, e);
            return new ArrayList<>();
        }
    }

    private static final float EXACT_BOOST = 4.0f;
    private static final float REQUIRED_BOOST = 2.0f;
    private static final float OPTIONAL_BOOST = 1.0f;

    @Override
    public List<SearchDocumentResult> searchWithStrategy(SearchQuery searchQuery) {
        String field = "content";
        try {
            int searchTopN = searchQuery.getTopN() > 0 ? searchQuery.getTopN() : MAX_SEARCH;
            // String currentPathPrefix = searchQuery.getPathPrefix();
            List<Query> dmqQueries = new ArrayList<>();

            // List<SearchDocumentResult> accumulatedResults = new ArrayList<>();
            List<String> exactPhrases = searchQuery.getExactPhrases();
            // 1. 精确短语匹配
            if (exactPhrases != null && !exactPhrases.isEmpty()) {
                // BooleanQuery.Builder exactBuilder = new BooleanQuery.Builder();
                for (String phrase : exactPhrases) {

                    // 添加短语查询（严格按顺序）
                    PhraseQuery.Builder phraseBuilder = new PhraseQuery.Builder();
                    phraseBuilder.setSlop(2);
                    TokenStream tokenStream = analyzer.tokenStream(field, phrase);
                    CharTermAttribute termAttr = tokenStream.addAttribute(CharTermAttribute.class);
                    int position = 0;
                    tokenStream.reset();
                    while (tokenStream.incrementToken()) {
                        String term = termAttr.toString();
                        logger.debug("Adding term {} to phrase query", term);
                        phraseBuilder.add(new Term(field, term), position++);
                    }
                    tokenStream.end();
                    tokenStream.close();
                    dmqQueries.add(new BoostQuery(phraseBuilder.build(), EXACT_BOOST));
                }
            }

            List<String> requiredTerms = searchQuery.getRequiredTerms();
            // 如果结果不够，继续搜索必需关键词
            if (requiredTerms != null
                    && !requiredTerms.isEmpty()) {

                BooleanQuery.Builder requiredBuilder = new BooleanQuery.Builder();
                for (String term : requiredTerms) {
                    Query termQuery = new TermQuery(new Term(field, term));
                    requiredBuilder.add(termQuery, BooleanClause.Occur.SHOULD);
                }
                requiredBuilder.setMinimumNumberShouldMatch(1);
                dmqQueries.add(new BoostQuery(requiredBuilder.build(), REQUIRED_BOOST));
            }
            List<String> optionalTerms = searchQuery.getOptionalTerms();
            // 如果结果还不够，使用可选关键词
            if (optionalTerms != null
                    && !optionalTerms.isEmpty()) {
                BooleanQuery.Builder optionalBuilder = new BooleanQuery.Builder();

                for (String term : optionalTerms) {
                    Query termQuery = new TermQuery(new Term(field, term));
                    optionalBuilder.add(termQuery, BooleanClause.Occur.SHOULD);
                }
                dmqQueries.add(new BoostQuery(optionalBuilder.build(), OPTIONAL_BOOST));
            }

            DisjunctionMaxQuery dmq = new DisjunctionMaxQuery(dmqQueries, 0.1f); // 0.1为tie breaker

            List<SearchDocumentResult> accumulatedResults = processSearchResults(dmq, searchQuery);

            // 如果还不够，用原始查询再补救一下，如果够了，就不不久了。
            if (accumulatedResults.size() < searchTopN && searchQuery.getOriginalQuery() != null
                    && !searchQuery.getOriginalQuery().isEmpty()) {
                int remainingCount = searchTopN - accumulatedResults.size();
                Query originalLuceneQuery = parseQuery(searchQuery.getOriginalQuery());
                List<SearchDocumentResult> originalResults = processSearchResults(originalLuceneQuery, searchQuery);
                // 将内容补到remainCount个
                for (SearchDocumentResult result : originalResults) {
                    if (accumulatedResults.size() >= remainingCount) {
                        break;
                    }
                    accumulatedResults.add(result);
                }
            }

            return accumulatedResults;
        } catch (Exception e) {
            logger.error("多策略搜索失败", e);
            return new ArrayList<>();
        }
    }

    // 添加一个辅助方法来处理搜索结果
    private List<SearchDocumentResult> processSearchResults(Query query, SearchQuery searchQuery)
            throws IOException {
        // 确保 topN 大于 0
        int topN = searchQuery.getTopN();

        Sort sort = null;

        if (topN <= 0) {
            throw new IllegalArgumentException("topN must be greater than 0");
        }

        try (DirectoryReader reader = DirectoryReader.open(directory)) {
            IndexSearcher searcher = new IndexSearcher(reader);

            // 如果有路径前缀，添加路径过滤
            if (searchQuery.getPathPrefix() != null && !searchQuery.getPathPrefix().isEmpty()) {
                BooleanQuery.Builder booleanQuery = new BooleanQuery.Builder();
                booleanQuery.add(query, BooleanClause.Occur.MUST);
                booleanQuery.add(new PrefixQuery(new Term("file_path", searchQuery.getPathPrefix())),
                        BooleanClause.Occur.MUST);
                query = booleanQuery.build();
            }

            LocalDateTime startTime = searchQuery.getStartTime();
            LocalDateTime endTime = searchQuery.getEndTime();
            if (startTime != null && endTime != null) {
                BooleanQuery.Builder booleanQuery = new BooleanQuery.Builder();
                booleanQuery.add(query, BooleanClause.Occur.MUST);
                long startTimestamp = startTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                long endTimestamp = endTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                Query timeRangeQuery = LongPoint.newRangeQuery("create_time", startTimestamp, endTimestamp);
                booleanQuery.add(timeRangeQuery, BooleanClause.Occur.MUST);
                query = booleanQuery.build();
            }

            // 处理日期排序

            if (searchQuery.getDateSort() != SearchQuery.SortOrder.NONE) {
                boolean reverse = searchQuery.getDateSort() == SearchQuery.SortOrder.DESC;
                sort = new Sort(new SortField("create_time", SortField.Type.LONG, reverse));
            }

            // 执行搜索
            TopDocs topDocs;
            if (sort != null) {
                topDocs = searcher.search(query, topN, sort);
            } else {
                topDocs = searcher.search(query, topN);
            }
            List<SearchDocumentResult> results = new ArrayList<>();

            // 设置高亮
            SimpleHTMLFormatter formatter = new SimpleHTMLFormatter();
            QueryScorer scorer = new QueryScorer(query);
            Highlighter highlighter = new Highlighter(formatter, scorer);
            highlighter.setTextFragmenter(new SimpleFragmenter(300));

            int index = 0;
            for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
                Document doc = searcher.doc(scoreDoc.doc);

                if (index == 0) {
                    logger.debug("First document ID: {}", doc.get("id"));
                    logger.debug("First document file path: {}", doc.get("file_path"));
                    logger.debug("First document content: {}", doc.get("content"));
                }

                SearchDocumentResult part = new SearchDocumentResult();
                String idStr = doc.get("id");
                if (idStr != null && !idStr.equals("null")) {
                    part.setId(Long.parseLong(idStr));
                } else {
                    logger.error("文档ID为空");
                    continue;
                }

                // 获取相关数据
                Long documentPartId = part.getId();
                Optional<MarkdownParagraphPO> markdownParagraph = markdownParagraphRepository.findById(documentPartId);
                markdownParagraph.ifPresent(content -> {
                    Long documentDataId = content.getDocumentDataId();
                    Optional<DocumentDataPO> documentData = documentDataRepository.findById(documentDataId);
                    documentData.ifPresent(data -> {
                        part.setTitle(data.getFilePath());
                    });
                    part.setMarkdownParagraph(content);
                });

                // 设置分数和高亮内容
                part.setScore(scoreDoc.score);
                String content = doc.get("content");
                try {
                    String snippet = highlighter.getBestFragment(analyzer, "content", content);
                    part.setHighLightContentPart(snippet != null ? snippet : "No match found");
                } catch (Exception e) {
                    logger.error("生成高亮片段失败", e);
                    part.setHighLightContentPart(content.substring(0, Math.min(content.length(), 300)));
                }

                results.add(part);
                index++;
            }

            return results;
        }
    }

    public boolean deleteIndex(String filePath) {
        try {
            if (filePath == null || filePath.isEmpty()) {
                logger.error("文件路径为空，无法删除索引");
                return false;
            }
            BooleanQuery.Builder booleanQuery = new BooleanQuery.Builder();
            Query pathQuery = new PrefixQuery(new Term("file_path", filePath));
            booleanQuery.add(pathQuery, BooleanClause.Occur.MUST);
            indexWriter.deleteDocuments(booleanQuery.build());
            indexWriter.commit();
            logger.info("成功删除路径 {} 下的索引", filePath);
            return true;
        } catch (IOException e) {
            logger.error("删除索引失败", e);
            return false;
        }
    }

    /**
     * 删除所有 id 为 null 的文档
     */
    public void deleteDocumentsWithNullId() {
        try (DirectoryReader reader = DirectoryReader.open(directory)) {
            // 获取删除前的文档数量
            int initialDocCount = reader.numDocs();

            Term nullIdTerm = new Term("id", "null");
            indexWriter.deleteDocuments(nullIdTerm);
            indexWriter.commit();

            // 获取删除后的文档数量
            try (DirectoryReader newReader = DirectoryReader.open(directory)) {
                int finalDocCount = newReader.numDocs();
                int deletedDocCount = initialDocCount - finalDocCount;
                logger.info("Deleted {} documents with null ID", deletedDocCount);
            }
        } catch (IOException e) {
            logger.error("Failed to delete documents with null ID", e);
        }
    }

    @Override
    public String getInterfaceDescription() {
        return "SimpleLocalLucenceIndex";
    }

    @Override
    public boolean deleteByParagraphId(String paragraphId) {
        try {
            synchronized (commitLock) {
                pendingOperations.add(IndexOperation.createDelete(paragraphId));
                if (pendingOperations.size() >= MAX_PENDING_DOCUMENTS) {
                    commitPendingOperations();
                }
            }
            logger.info("段落删除请求已提交 ID: {}", paragraphId);
            return true;
        } catch (Exception e) {
            logger.error("提交段落删除请求失败 ID: {}", paragraphId, e);
            return false;
        }
    }

    @Override
    public String insertOrUpdateByParagraphId(DocumentBuilder builder) {
        try {
            Document newDoc = builder.build();
            String paragraphId = newDoc.get("id");

            if (paragraphId == null || paragraphId.isEmpty() || paragraphId.equals("null")) {
                throw new RuntimeException("Paragraph ID is empty");
            }

            synchronized (commitLock) {
                Document finalDoc = newDoc; // 默认使用新文档

                // 1. 尝试获取已存在的文档
                try (DirectoryReader reader = DirectoryReader.open(directory)) {
                    IndexSearcher searcher = new IndexSearcher(reader);
                    Term term = new Term("id", paragraphId);
                    TopDocs docs = searcher.search(new TermQuery(term), 1);

                    if (docs.totalHits.value > 0) {
                        // 1.2 文档存在，合并字段
                        Document existingDoc = searcher.doc(docs.scoreDocs[0].doc);
                        finalDoc = mergeDocuments(existingDoc, newDoc);
                        logger.debug("Merging existing document with new data for ID: {}", paragraphId);
                    } else {
                        // 1.1 文档不存在，使用新文档
                        logger.debug("Creating new document for ID: {}", paragraphId);
                    }
                }

                // 2. 删除旧文档
                pendingOperations.add(IndexOperation.createDelete(paragraphId));

                // 3. 插入合并后的文档
                pendingOperations.add(IndexOperation.createInsert(finalDoc));

                if (pendingOperations.size() >= MAX_PENDING_DOCUMENTS) {
                    commitPendingOperations();
                }
            }

            return "Index update request submitted";
        } catch (Exception e) {
            logger.error("更新索引失败", e);
            return "Failed to submit index update request";
        }
    }

    /**
     * 合并两个文档，保留原有文档的字段，用新文档的字段覆盖
     */
    private Document mergeDocuments(Document existingDoc, Document newDoc) {
        Document mergedDoc = new Document();

        // 保存所有已存在的字段
        for (IndexableField field : existingDoc.getFields()) {
            mergedDoc.add(field);
        }

        // 用新文档的字段覆盖或添加
        for (IndexableField field : newDoc.getFields()) {
            String fieldName = field.name();
            // 如果字段已存在，先删除旧值
            mergedDoc.removeFields(fieldName);
            // 添加新值
            mergedDoc.add(field);
        }

        return mergedDoc;
    }

    // 辅助方法：记录分词日志
    @SuppressWarnings("unused")
    private void logTokenization(String content) {
        // try (TokenStream ts = analyzer.tokenStream("content", content)) {
        // CharTermAttribute termAttr = ts.addAttribute(CharTermAttribute.class);
        // ts.reset();
        // StringBuilder terms = new StringBuilder("Indexed terms: ");
        // while (ts.incrementToken()) {
        // terms.append(termAttr.toString()).append(", ");
        // }
        // logger.debug(terms.toString());
        // } catch (IOException e) {
        // logger.error("分词日志记录失败", e);
        // }
    }

    @Override
    public void deleteByRefineryTaskId(Long taskId, Long paragraphId) throws IOException {
        try {
            synchronized (commitLock) {
                // 先删除原有文档
                pendingOperations.add(IndexOperation.createDelete(paragraphId.toString()));

                // 重建文档，但不包含refineryTaskId字段
                try (DirectoryReader reader = DirectoryReader.open(directory)) {
                    IndexSearcher searcher = new IndexSearcher(reader);
                    Term term = new Term("id", paragraphId.toString());
                    TopDocs docs = searcher.search(new TermQuery(term), 1);

                    if (docs.totalHits.value > 0) {
                        Document oldDoc = searcher.doc(docs.scoreDocs[0].doc);
                        Document newDoc = new Document();

                        // 复制所有字段，除了refinery_task_id
                        for (IndexableField field : oldDoc.getFields()) {
                            if (!field.name().equals("refinery_task_id")) {
                                newDoc.add(field);
                            }
                        }

                        // 添加新文档到待处理队列
                        pendingOperations.add(IndexOperation.createInsert(newDoc));
                    }
                }

                if (pendingOperations.size() >= MAX_PENDING_DOCUMENTS) {
                    commitPendingOperations();
                }
            }
            logger.info("已提交清除任务ID的请求 - TaskID: {}, ParagraphID: {}", taskId, paragraphId);
        } catch (Exception e) {
            logger.error("清除任务ID失败 - TaskID: {}, ParagraphID: {}", taskId, paragraphId, e);
            throw new IOException("Failed to clear refinery task ID", e);
        }
    }

}
