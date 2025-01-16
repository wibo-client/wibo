package com.wibot.index.analyzer;

import org.apache.lucene.analysis.Analyzer;
import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.Tokenizer;
import org.apache.lucene.analysis.core.WhitespaceTokenizer;
import java.io.IOException;
import java.io.Reader;
import java.util.ArrayList;
import java.util.List;

public class CompositeAnalyzer extends Analyzer {
    private final List<Analyzer> analyzers;

    public CompositeAnalyzer(Analyzer... analyzers) {
        this.analyzers = new ArrayList<>();
        for (Analyzer analyzer : analyzers) {
            this.analyzers.add(analyzer);
        }
    }

    @Override
    protected TokenStreamComponents createComponents(String fieldName) {
        Tokenizer tokenizer = new WhitespaceTokenizer();
        TokenStream mergedTokenStream = tokenizer;

        for (int i = 0; i < analyzers.size(); i++) {
            Analyzer analyzer = analyzers.get(i);
            try {
                TokenStream analyzerStream = analyzer.tokenStream(fieldName, tokenizer);
                mergedTokenStream = new MergedTokenStream(mergedTokenStream, analyzerStream);
            } catch (IOException e) {
                throw new RuntimeException("合并TokenStream失败", e);
            }
        }

        return new TokenStreamComponents(tokenizer, mergedTokenStream);
    }
}
