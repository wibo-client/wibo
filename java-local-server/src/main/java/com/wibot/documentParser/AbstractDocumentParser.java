package com.wibot.documentParser;

import org.springframework.beans.factory.annotation.Autowired;
import com.wibot.persistence.entity.DocumentDataPO;
import com.wibot.service.SystemConfigService;

public abstract class AbstractDocumentParser implements DocumentParserInterface {
    @Autowired
    protected SystemConfigService systemConfigService;

    @Override
    public String parseDocument(DocumentDataPO documentData) {
        StringBuilder stringBuilder = new StringBuilder();
        stringBuilder.append("# " + documentData.getFileName());
        stringBuilder.append("\n");
        stringBuilder.append("# Document File Name: ");
        stringBuilder.append("\n");
        stringBuilder.append(documentData.getFileName());
        stringBuilder.append("\n");
        stringBuilder.append("# Document Extension: ");
        stringBuilder.append("\n");
        stringBuilder.append(documentData.getExtension());
        stringBuilder.append("\n");
        stringBuilder.append("# Document content: ");
        stringBuilder.append("\n");
        stringBuilder.append(parseDocumentInner(documentData));
        return stringBuilder.toString();
    }

    protected abstract String parseDocumentInner(DocumentDataPO documentData);

    @Override
    public boolean shouldProcess(String extension) {
        String fileType = getFileType();
        if (fileType == null) {
            return false;
        }
        
        Boolean enabled = systemConfigService.getConfig(
            "filetype." + fileType + ".enabled",
            Boolean.class,
            false
        );
        
        return enabled ;
    }

    /**
     * 获取当前解析器对应的文件类型
     * @return 文件类型，如"text", "image", "pdf"等
     */
    protected abstract String getFileType();

}
