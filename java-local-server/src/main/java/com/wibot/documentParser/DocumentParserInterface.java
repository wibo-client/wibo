package com.wibot.documentParser;

import com.wibot.persistence.entity.DocumentDataPO;

public interface DocumentParserInterface {
    String parseDocument(DocumentDataPO documentData);
    
    /**
     * 检查当前解析器是否应该处理指定的扩展名
     * @param extension 文件扩展名
     * @return 如果应该处理返回true，否则返回false
     */
    boolean shouldProcess(String extension);
}
