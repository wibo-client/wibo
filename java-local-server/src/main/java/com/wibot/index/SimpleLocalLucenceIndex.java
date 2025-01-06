package com.wibot.index;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.standard.StandardAnalyzer;
import org.apache.lucene.document.Document;
import org.apache.lucene.document.Field;
import org.apache.lucene.document.StringField;
import org.apache.lucene.document.TextField;
import org.apache.lucene.index.ConcurrentMergeScheduler;
import org.apache.lucene.index.DirectoryReader;
import org.apache.lucene.index.IndexWriter;
import org.apache.lucene.index.IndexWriterConfig;
import org.apache.lucene.index.StoredFields;
import org.apache.lucene.index.Term;
import org.apache.lucene.queryparser.classic.QueryParser;
import org.apache.lucene.search.IndexSearcher;
import org.apache.lucene.search.Query;
import org.apache.lucene.search.ScoreDoc;
import org.apache.lucene.search.TopDocs;
import org.apache.lucene.search.highlight.Highlighter;
import org.apache.lucene.search.highlight.QueryScorer;
import org.apache.lucene.search.highlight.SimpleFragmenter;
import org.apache.lucene.search.highlight.SimpleHTMLFormatter;
import org.apache.lucene.store.Directory;
import org.apache.lucene.store.FSDirectory;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import com.wibot.index.analyzerKW.SearchEngineAnalyzer;
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
    //     JSONObject configJson = new JSONObject(configStr);
    //     String indexDir = configJson.getString("indexDir");
    //     if (indexDir != null && !indexDir.isEmpty()) {
    //         INDEX_DIR = indexDir;
    //     }
    //     String maxSearch = configJson.getString("maxSearch");
    //     if (maxSearch != null && !maxSearch.isEmpty()) {
    //         MAX_SEARCH = Integer.parseInt(maxSearch);
    //     }

    //     try {
    //         directory = FSDirectory.open(Paths.get(INDEX_DIR));
    //         analyzer = new StandardAnalyzer();
    //         IndexWriterConfig config = new IndexWriterConfig(analyzer);
    //         config.setRAMBufferSizeMB(256.0); // 增加内存缓冲区大小
    //         config.setMaxBufferedDocs(1000); // 增加最大缓冲文档数
    //         config.setMergeScheduler(new ConcurrentMergeScheduler()); // 使用并发合并调度器
    //         indexWriter = new IndexWriter(directory, config);
    //     } catch (IOException e) {
    //         throw new RuntimeException("初始化索引失败", e);
    //     }
    //     startCommitScheduler();
    // }

    @PostConstruct
    public void init(){
        try {
            directory = FSDirectory.open(Paths.get(indexDir));
            analyzer = new StandardAnalyzer();
            IndexWriterConfig config = new IndexWriterConfig(analyzer);
            config.setRAMBufferSizeMB(256.0); // 增加内存缓冲区大小
            config.setMaxBufferedDocs(1000); // 增加最大缓冲文档数
            config.setMergeScheduler(new ConcurrentMergeScheduler()); // 使用并发合并调度器
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
            doc.add(new TextField("content", cleanText(content), Field.Store.YES));
            synchronized (commitLock) {
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

    public List<SearchDocumentResult> search(String queryStr, String pathPrefix, int TopN) {
        try {
            List<SearchDocumentResult> results = new ArrayList<>();
            try (DirectoryReader reader = DirectoryReader.open(directory)) {
                IndexSearcher searcher = new IndexSearcher(reader);

                // 构建组合查询
                BooleanQuery.Builder booleanQuery = new BooleanQuery.Builder();

                // 内容查询
                QueryParser contentParser = new QueryParser("content", analyzer);
                Query contentQuery = contentParser.parse(cleanText(queryStr));
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
                StoredFields storedFields = searcher.storedFields();
                for (ScoreDoc scoreDoc : topDocs.scoreDocs) {
                    Document doc = storedFields.document(scoreDoc.doc);
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
