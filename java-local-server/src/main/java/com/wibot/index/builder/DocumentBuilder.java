package com.wibot.index.builder;

import org.apache.lucene.document.*;
import org.apache.lucene.index.IndexOptions;
import java.time.LocalDateTime;
import java.time.ZoneId;

public class DocumentBuilder {
    private Document doc;
    private String docId;

    public DocumentBuilder(String docId) {
        this.docId = docId;
        this.doc = new Document();
        doc.add(new StringField("id", docId, Field.Store.YES));
    }

    public DocumentBuilder withFilePath(String filePath) {
        if (filePath != null) {
            doc.add(new StringField("file_path", filePath, Field.Store.YES));
        }
        return this;
    }

    public DocumentBuilder withContent(String content) {
        if (content != null) {
            // 创建自定义的内容字段类型
            FieldType contentFieldType = new FieldType();
            contentFieldType.setStored(true);
            contentFieldType.setTokenized(true);
            contentFieldType.setIndexOptions(IndexOptions.DOCS_AND_FREQS_AND_POSITIONS_AND_OFFSETS);
            contentFieldType.setStoreTermVectors(true);
            contentFieldType.setStoreTermVectorPositions(true);
            contentFieldType.setStoreTermVectorOffsets(true);

            // 添加内容字段
            doc.add(new Field("content", content, contentFieldType));
        }
        return this;
    }

    public DocumentBuilder withRefineryTask(Long refineryTaskId) {
        if (refineryTaskId != null) {
            // 只需要存储taskId作为一个单独的term
            doc.add(new StringField("refinery_task_id", String.valueOf(refineryTaskId), Field.Store.YES));
        }
        return this;
    }

    public DocumentBuilder withFact(String fact) {
        if (fact != null) {
            // 创建与content相同的字段类型，用于模糊查找
            FieldType factFieldType = new FieldType();
            factFieldType.setStored(true);
            factFieldType.setTokenized(true);
            factFieldType.setIndexOptions(IndexOptions.DOCS_AND_FREQS_AND_POSITIONS_AND_OFFSETS);
            factFieldType.setStoreTermVectors(true);
            factFieldType.setStoreTermVectorPositions(true);
            factFieldType.setStoreTermVectorOffsets(true);

            doc.add(new Field("fact", fact, factFieldType));
        }
        return this;
    }

    public DocumentBuilder withCreateTime(LocalDateTime createTime) {
        if (createTime != null) {
            long timestamp = createTime.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
            doc.add(new NumericDocValuesField("create_time", timestamp));
            doc.add(new StoredField("create_time_display", createTime.toString()));
        }
        return this;
    }

    public Document build() {
        return doc;
    }
}
