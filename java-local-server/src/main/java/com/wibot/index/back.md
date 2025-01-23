
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

      // @Override
    // public List<String> getPossiblePath(String path) {
    // List<String> suggestions = new ArrayList<>();
    // try {
    // List<DocumentDataPO> documents =
    // documentDataRepository.findByFilePathStartingWith(path);
    // for (DocumentDataPO document : documents) {
    // String filePath = document.getFilePath();
    // String relativePath = filePath.substring(path.length());
    // int nextSlashIndex = relativePath.indexOf('/');
    // if (nextSlashIndex != -1) {
    // String nextPath = relativePath.substring(0, nextSlashIndex + 1);
    // if (!suggestions.contains(nextPath)) {
    // suggestions.add(nextPath);
    // }
    // } else {
    // if (!suggestions.contains(relativePath)) {
    // suggestions.add(relativePath);
    // }
    // }
    // }
    // } catch (Exception e) {
    // logger.error("获取路径建议失败: {}", path, e);
    // }
    // return suggestions;
    // }



    // @GetMapping("/search/diagnose")
    // @ResponseBody
    // public Map<String, Object> diagnoseSearch(
    // @RequestParam String query,
    // @RequestParam(required = false) String pathPrefix) {
    // Map<String, Object> response = new HashMap<>();
    // try {
    // // 添加编码处理
    // String decodedQuery = URLDecoder.decode(query,
    // StandardCharsets.UTF_8.name());

    // DocumentIndexInterface indexInterface =
    // pathBasedIndexHandlerSelector.selectIndexHandler(pathPrefix);
    // if (indexInterface instanceof SimpleLocalLucenceIndex) {
    // String diagnosis = ((SimpleLocalLucenceIndex)
    // indexInterface).searchDiagnose(decodedQuery);
    // response.put("success", true);
    // response.put("diagnosis", diagnosis);
    // } else {
    // response.put("success", false);
    // response.put("error", "Unsupported index type");
    // }
    // } catch (Exception e) {
    // response.put("success", false);
    // response.put("error", e.getMessage());
    // }
    // return response;
    // }



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