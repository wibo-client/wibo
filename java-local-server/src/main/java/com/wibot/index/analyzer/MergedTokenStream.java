package com.wibot.index.analyzer;

import org.apache.lucene.analysis.TokenStream;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

class MergedTokenStream extends TokenStream {
    private final List<String> tokens = new ArrayList<>();
    private int position = 0;
    private final CharTermAttribute termAtt;

    MergedTokenStream(TokenStream ts1, TokenStream ts2) throws IOException {
        termAtt = addAttribute(CharTermAttribute.class);

        // 读取第一个TokenStream
        ts1.reset();
        CharTermAttribute term1 = ts1.getAttribute(CharTermAttribute.class);
        while (ts1.incrementToken()) {
            tokens.add(term1.toString());
        }
        ts1.end();
        ts1.close();

        // 读取第二个TokenStream
        ts2.reset();
        CharTermAttribute term2 = ts2.getAttribute(CharTermAttribute.class);
        while (ts2.incrementToken()) {
            tokens.add(term2.toString());
        }
        ts2.end();
        ts2.close();
    }

    @Override
    public boolean incrementToken() throws IOException {
        if (position < tokens.size()) {
            clearAttributes();
            termAtt.setEmpty().append(tokens.get(position++));
            return true;
        }
        return false;
    }

    @Override
    public void reset() throws IOException {
        super.reset();
        position = 0;
    }
}
