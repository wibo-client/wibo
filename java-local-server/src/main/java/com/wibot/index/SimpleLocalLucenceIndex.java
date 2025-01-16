package com.wibot.index;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.HashSet;
import java.util.Set;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.analysis.cn.smart.SmartChineseAnalyzer;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.FieldType;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.ConcurrentMergeScheduler;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexOptions;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.IndexableField;
import org.apache.lucene.index.MultiTerms;
import org.apache.lucene.index.Term;
import org.apache.lucene.index.Terms;
import org.apache.lucene.index.TermsEnum;
import org.apache.lucene.queryparser.classic.MultiFieldQueryParser;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
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
import org.apache.lucene.util.BytesRef;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import com.wibot.index.analyzer.CompositeAnalyzer;
import com.wibot.index.analyzerKW.SearchEngineAnalyzer;
import com.wibot.index.search.SearchQuery;
import com.wibot.persistence.DocumentDataRepository;
import com.wibot.persistence.MarkdownParagraphRepository;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.persistence.entity.MarkdownParagraphPO;

import org.apache.lucene.search.BooleanQuery;
import org.apache.lucene.search.BooleanClause;
import org.apache.lucene.search.PrefixQuery;

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
    private final List<Document> pendingDocuments = new ArrayList<>();
    private final Object commitLock = new Object();

    // public SimpleLocalLucenceIndex(String configStr) {
    // JSONObject configJson = new JSONObject(configStr);
    // String indexDir = configJson.getString("indexDir");
    // if (indexDir != null && !indexDir.isEmpty()) {
    // INDEX_DIR = indexDir;
    // }
    // String maxSearch = configJson.getString("maxSearch");
    // if (maxSearch != null && !maxSearch.isEmpty()) {
    // MAX_SEARCH = Integer.parseInt(maxSearch);
    // }

    // try {
    // directory = FSDirectory.open(Paths.get(INDEX_DIR));
    // analyzer = new StandardAnalyzer();
    // IndexWriterConfig config = new IndexWriterConfig(analyzer);
    // config.setRAMBufferSizeMB(256.0); // 增加内存缓冲区大小
    // config.setMaxBufferedDocs(1000); // 增加最大缓冲文档数
    // config.setMergeScheduler(new ConcurrentMergeScheduler()); // 使用并发合并调度器
    // indexWriter = new IndexWriter(directory, config);
    // } catch (IOException e) {
    // throw new RuntimeException("初始化索引失败", e);
    // }
    // startCommitScheduler();
    // }

    @PostConstruct
    public void init() {
        try {
            directory = FSDirectory.open(Paths.get(indexDir));
            // 修改：使用组合分析器替代单一的StandardAnalyzer
            analyzer = new CompositeAnalyzer(
                    new SmartChineseAnalyzer(), // 中文分词
                    new StandardAnalyzer() // 英文和数字分词
            );
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
                    commitPendingDocuments();
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        });
    }

    private void commitPendingDocuments() {
        synchronized (commitLock) {
            if (!pendingDocuments.isEmpty()) {
                try {
                    for (Document doc : pendingDocuments) {
                        indexWriter.addDocument(doc);
                    }
                    indexWriter.commit();
                    pendingDocuments.clear();
                } catch (IOException e) {
                    logger.error("提交文档失败", e);
                }
            }
        }
    }

    @PreDestroy
    public void close() {
        try {
            commitPendingDocuments();
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

    @Override
    public String buildIndex(String docId, String filePath, String content) {
        try {
            Document doc = new Document();
            if (docId == null || docId.isEmpty() || docId.equals("null")) {
                throw new RuntimeException("Document ID is empty");
            }
            doc.add(new StringField("id", docId, Field.Store.YES));
            logger.debug("Adding file path to index: {}", filePath);
            doc.add(new StringField("file_path", filePath, Field.Store.YES));

            // 修改：使用组合分析器处理内容
            String cleanedContent = cleanText(content);
            logger.debug("Building index for content: {}", cleanedContent); // 添加日志

            FieldType contentFieldType = new FieldType();
            contentFieldType.setStored(true);
            contentFieldType.setTokenized(true);
            contentFieldType.setIndexOptions(IndexOptions.DOCS_AND_FREQS_AND_POSITIONS_AND_OFFSETS);
            contentFieldType.setStoreTermVectors(true);
            contentFieldType.setStoreTermVectorPositions(true);
            contentFieldType.setStoreTermVectorOffsets(true);

            // 修改：确保内容被正确分词和索引
            Field contentField = new Field("content", cleanedContent, contentFieldType);
            doc.add(contentField);

            // 添加未经分词的原始字段，用于精确匹配
            Field rawContentField = new Field("raw_content", cleanedContent, contentFieldType);
            doc.add(rawContentField);

            // 添加分词调试
            logger.debug("Building index for content: {} with raw content: {}", cleanedContent, content);
            logger.debug("Document ID: {}, Path: {}", docId, filePath);

            synchronized (commitLock) {
                // 添加调试日志
                try (TokenStream ts = analyzer.tokenStream("content", cleanedContent)) {
                    CharTermAttribute termAttr = ts.addAttribute(CharTermAttribute.class);
                    ts.reset();
                    StringBuilder terms = new StringBuilder("Indexed terms: ");
                    while (ts.incrementToken()) {
                        terms.append(termAttr.toString()).append(", ");
                    }
                    logger.debug(terms.toString());
                }
                pendingDocuments.add(doc);
                if (pendingDocuments.size() >= MAX_PENDING_DOCUMENTS) {
                    commitPendingDocuments();
                }
            }
            return "Index build request submitted";
        } catch (Exception e) {
            logger.error("构建索引失败", e);
            return "Failed to submit index build request";
        }
    }

    @Override
    public List<SearchDocumentResult> search(String queryStr, String pathPrefix) {
        try {
            return search(queryStr, pathPrefix, MAX_SEARCH);
        } catch (Exception e) {
            logger.error("搜索失败: {}", queryStr, e);
            return new ArrayList<>();
        }
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

    @Override
    public List<SearchDocumentResult> search(String query) {
        return search(query, null, MAX_SEARCH);
    }

    @Override
    public List<SearchDocumentResult> search(String query, int TopN) {
        return search(query, null, TopN);
    }

    // 在同一文件中
    private Query parseQuery(String queryStr) throws Exception {
        logger.debug("Building query for: {}", queryStr);
        String cleanedQuery = cleanText(queryStr);

        // 替换现有的 TermQuery 或 BooleanQuery 构建逻辑，使用多字段解析器:
        String[] fields = { "content", "raw_content" };
        MultiFieldQueryParser parser = new MultiFieldQueryParser(fields, analyzer);
        // 可选：添加模糊搜索参数（例如模糊度 2）
        parser.setFuzzyMinSim(0.7f);
        parser.setPhraseSlop(2); // 根据需要调整
        Query query = parser.parse(queryStr + "~2"); // "~2" 表示模糊度或者短语搜索可选

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
                SimpleHTMLFormatter formatter = new SimpleHTMLFormatter();
                QueryScorer scorer = new QueryScorer(contentQuery);
                Highlighter highlighter = new Highlighter(formatter, scorer);
                highlighter.setTextFragmenter(new SimpleFragmenter(300));

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
                    String snippet = highlighter.getBestFragment(analyzer, "content", content);
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

    public List<SearchDocumentResult> searchWithStrategy(SearchQuery searchQuery) {
        try {
            int searchTopN = searchQuery.getTopN() > 0 ? searchQuery.getTopN() : MAX_SEARCH;
            String currentPathPrefix = searchQuery.getPathPrefix();

            // 用于存储所有结果和去重
            Set<Long> foundIds = new HashSet<>();
            List<SearchDocumentResult> accumulatedResults = new ArrayList<>();

            // 1. 精确短语匹配
            if (searchQuery.getExactPhrases() != null && !searchQuery.getExactPhrases().isEmpty()) {
                BooleanQuery.Builder exactBuilder = new BooleanQuery.Builder();
                for (String phrase : searchQuery.getExactPhrases()) {
                    Query termQuery = new TermQuery(new Term("content", phrase));
                    exactBuilder.add(termQuery, BooleanClause.Occur.SHOULD);
                }
                exactBuilder.setMinimumNumberShouldMatch(1);
                List<SearchDocumentResult> exactResults = search(exactBuilder.build(), currentPathPrefix, searchTopN);
                addUniqueResults(accumulatedResults, exactResults, foundIds);
            }

            // 如果结果不够，继续搜索必需关键词
            if (accumulatedResults.size() < searchTopN && searchQuery.getRequiredTerms() != null
                    && !searchQuery.getRequiredTerms().isEmpty()) {
                int remainingCount = searchTopN - accumulatedResults.size();
                BooleanQuery.Builder requiredBuilder = new BooleanQuery.Builder();
                for (String term : searchQuery.getRequiredTerms()) {
                    Query termQuery = new TermQuery(new Term("content", term));
                    requiredBuilder.add(termQuery, BooleanClause.Occur.MUST);
                }
                List<SearchDocumentResult> requiredResults = search(requiredBuilder.build(), currentPathPrefix,
                        remainingCount);
                addUniqueResults(accumulatedResults, requiredResults, foundIds);
            }

            // 如果结果还不够，使用可选关键词
            if (accumulatedResults.size() < searchTopN && searchQuery.getOptionalTerms() != null
                    && !searchQuery.getOptionalTerms().isEmpty()) {
                int remainingCount = searchTopN - accumulatedResults.size();
                String optionalQuery = String.join(" ", searchQuery.getOptionalTerms());
                List<SearchDocumentResult> optionalResults = search(optionalQuery, currentPathPrefix, remainingCount);
                addUniqueResults(accumulatedResults, optionalResults, foundIds);
            }

            // 按相关度分数排序
            accumulatedResults.sort((a, b) -> Float.compare(b.getScore(), a.getScore()));

            return accumulatedResults;

        } catch (Exception e) {
            logger.error("多策略搜索失败", e);
            return new ArrayList<>();
        }
    }

    // 添加辅助方法用于去重添加结果
    private void addUniqueResults(List<SearchDocumentResult> accumulated, List<SearchDocumentResult> newResults,
            Set<Long> foundIds) {
        for (SearchDocumentResult result : newResults) {
            if (foundIds.add(result.getId())) { // 如果ID不存在，则添加
                accumulated.add(result);
            }
        }
    }

    // 添加一个新的重载方法用于处理 Query 对象的搜索
    private List<SearchDocumentResult> search(Query query, String pathPrefix, int topN) throws IOException {
        try (DirectoryReader reader = DirectoryReader.open(directory)) {
            IndexSearcher searcher = new IndexSearcher(reader);

            // 如果有路径前缀，添加路径过滤
            if (pathPrefix != null && !pathPrefix.isEmpty()) {
                BooleanQuery.Builder booleanQuery = new BooleanQuery.Builder();
                booleanQuery.add(query, BooleanClause.Occur.MUST);
                booleanQuery.add(new PrefixQuery(new Term("file_path", pathPrefix)), BooleanClause.Occur.MUST);
                query = booleanQuery.build();
            }

            // 执行搜索并处理结果
            return processSearchResults(searcher, query, topN);
        }
    }

    // 添加一个辅助方法来处理搜索结果
    private List<SearchDocumentResult> processSearchResults(IndexSearcher searcher, Query query, int topN)
            throws IOException {
        TopDocs topDocs = searcher.search(query, topN);
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

    // 添加诊断方法
    public String diagnoseIndex() throws IOException {
        StringBuilder diagnosis = new StringBuilder();
        try (DirectoryReader reader = DirectoryReader.open(directory)) {
            diagnosis.append("Index diagnosis:\n");
            diagnosis.append(String.format("Total documents: %d\n", reader.numDocs()));

            // 检查几个示例文档
            int maxDocs = Math.min(1, reader.maxDoc());
            diagnosis.append(String.format("Checking first %d documents:\n", maxDocs));

            for (int i = 0; i < maxDocs; i++) {
                Document doc = reader.document(i);
                String content = doc.get("content");
                diagnosis.append(String.format("\nDocument %d:\n", i));
                diagnosis.append(String.format("ID: %s\n", doc.get("id")));
                diagnosis.append(String.format("Path: %s\n", doc.get("file_path")));
                diagnosis.append(String.format("Content preview: %s\n",
                        content != null ? content.substring(0, Math.min(100, content.length())) : "null"));

                // 分析文档的词条
                diagnosis.append("Terms:\n");
                Terms terms = reader.getTermVector(i, "content");
                if (terms != null) {
                    TermsEnum termsEnum = terms.iterator();
                    BytesRef term;
                    while ((term = termsEnum.next()) != null) {
                        diagnosis.append(term.utf8ToString()).append(", ");
                    }
                }

                // 使用 SmartChineseAnalyzer 分词
                diagnosis.append("\nSmartChineseAnalyzer terms:\n");
                try (TokenStream ts = new SmartChineseAnalyzer().tokenStream("content", content)) {
                    CharTermAttribute termAttr = ts.addAttribute(CharTermAttribute.class);
                    ts.reset();
                    while (ts.incrementToken()) {
                        diagnosis.append(termAttr.toString()).append(", ");
                    }
                    ts.end();
                }

                // 使用 StandardAnalyzer 分词
                diagnosis.append("\nStandardAnalyzer terms:\n");
                try (TokenStream ts = new StandardAnalyzer().tokenStream("content", content)) {
                    CharTermAttribute termAttr = ts.addAttribute(CharTermAttribute.class);
                    ts.reset();
                    while (ts.incrementToken()) {
                        diagnosis.append(termAttr.toString()).append(", ");
                    }
                    ts.end();
                }
                diagnosis.append("\n");
            }

            // 添加详细诊断信息
            diagnosis.append("\n=== 详细诊断信息 ===\n");
            diagnosis.append(detailedDiagnose());

            return diagnosis.toString();
        }
    }

    public String detailedDiagnose() throws IOException {
        StringBuilder diagnosis = new StringBuilder();

        // 1. 检查索引状态
        try (DirectoryReader reader = DirectoryReader.open(directory)) {
            diagnosis.append("=== 索引状态 ===\n");
            diagnosis.append(String.format("NumDocs: %d\n", reader.numDocs()));
            diagnosis.append(String.format("MaxDoc: %d\n", reader.maxDoc()));
            diagnosis.append(String.format("DeletedDocs: %d\n", reader.numDeletedDocs()));

            // 2. 检查文档字段
            diagnosis.append("\n=== 文档字段检查 ===\n");
            for (int i = 0; i < Math.min(2, reader.maxDoc()); i++) {
                Document doc = reader.document(i);
                diagnosis.append(String.format("\nDoc %d:\n", i));
                // 检查所有字段
                for (IndexableField field : doc.getFields()) {
                    diagnosis.append(String.format("Field: %s, Type: %s, Stored: %b\n",
                            field.name(),
                            field.fieldType().getClass().getSimpleName(),
                            field.fieldType().stored()));
                }

                // 3. 检查词向量
                Terms terms = reader.getTermVector(i, "content");
                if (terms != null) {
                    diagnosis.append("Has term vector for 'content'\n");
                    TermsEnum termsEnum = terms.iterator();
                    while (termsEnum.next() != null) {
                        diagnosis.append(String.format("Term: %s, Freq: %d\n",
                                termsEnum.term().utf8ToString(),
                                termsEnum.totalTermFreq()));
                    }
                } else {
                    diagnosis.append("No term vector for 'content'\n");
                }
            }

            // 4. 检查索引的词项统计
            diagnosis.append("\n=== 索引词项统计 ===\n");
            Terms contentTerms = MultiTerms.getTerms(reader, "content");
            if (contentTerms != null) {
                diagnosis.append(String.format("Unique terms: %d\n", contentTerms.size()));
                diagnosis.append(String.format("Total terms: %d\n", contentTerms.getSumTotalTermFreq()));
            }
        }

        return diagnosis.toString();
    }

    public String searchDiagnose(String query) throws IOException {
        // 1. 打印原始查询
        StringBuilder diagnosis = new StringBuilder();
        diagnosis.append("Search diagnosis for query: " + query + "\n");

        // 2. 构建BooleanQuery
        BooleanQuery.Builder queryBuilder = new BooleanQuery.Builder();

        // 3. 添加精确匹配
        queryBuilder.add(new BooleanClause(
                new TermQuery(new Term("content", query)),
                BooleanClause.Occur.SHOULD));

        // 4. 添加分词匹配
        try (TokenStream ts = analyzer.tokenStream("content", query)) {
            ts.reset();
            CharTermAttribute termAttr = ts.addAttribute(CharTermAttribute.class);
            while (ts.incrementToken()) {
                String term = termAttr.toString();
                queryBuilder.add(new BooleanClause(
                        new TermQuery(new Term("content", term)),
                        BooleanClause.Occur.SHOULD));
            }
        }
        DirectoryReader reader = DirectoryReader.open(directory);
        // 5. 执行查询并返回诊断信息
        IndexSearcher searcher = new IndexSearcher(reader);
        TopDocs results = searcher.search(queryBuilder.build(), 10);

        diagnosis.append("Found " + results.totalHits.value + " matching documents\n");
        return diagnosis.toString();
    }

    @Override
    public List<String> getPossiblePath(String path) {
        List<String> suggestions = new ArrayList<>();
        try {
            List<DocumentDataPO> documents = documentDataRepository.findByFilePathStartingWith(path);
            for (DocumentDataPO document : documents) {
                String filePath = document.getFilePath();
                String relativePath = filePath.substring(path.length());
                int nextSlashIndex = relativePath.indexOf('/');
                if (nextSlashIndex != -1) {
                    String nextPath = relativePath.substring(0, nextSlashIndex + 1);
                    if (!suggestions.contains(nextPath)) {
                        suggestions.add(nextPath);
                    }
                } else {
                    if (!suggestions.contains(relativePath)) {
                        suggestions.add(relativePath);
                    }
                }
            }
        } catch (Exception e) {
            logger.error("获取路径建议失败: {}", path, e);
        }
        return suggestions;
    }
}
