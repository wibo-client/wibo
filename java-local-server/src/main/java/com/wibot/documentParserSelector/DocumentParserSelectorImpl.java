package com.wibot.documentParserSelector;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.wibot.documentParser.ArchiveParser;
import com.wibot.documentParser.ConfigCodeParser;
import com.wibot.documentParser.DOCXDocumentParser;
import com.wibot.documentParser.DefaultParser;
import com.wibot.documentParser.DocumentParserInterface;
// import com.wibot.documentParser.HEICDocumentParser;
import com.wibot.documentParser.JPGDocumentParser;
import com.wibot.documentParser.OCRBasedPDFDocumentParser;
import com.wibot.documentParser.PNGDocumentParser;
import com.wibot.documentParser.PPTDocumentParser;
import com.wibot.documentParser.SourceCodeParser;
import com.wibot.documentParser.TextDocumentParser;
import com.wibot.documentParser.WebtDocumentParser;
import com.wibot.documentParser.XlsxDocumentParser;

@Service
public class DocumentParserSelectorImpl implements DocumentParserSelectorInterface {
    private static final org.slf4j.Logger logger = org.slf4j.LoggerFactory.getLogger(DocumentParserSelectorImpl.class);
    @Autowired
    private OCRBasedPDFDocumentParser ocrBasedPDFDocumentParser;

    @Autowired
    private PNGDocumentParser pngDocumentParser;

    @Autowired
    private DOCXDocumentParser docxDocumentParser;

    @Autowired
    private DefaultParser defaultParser;

    @Autowired
    private JPGDocumentParser jpgDocumentParser;

    @Autowired
    private XlsxDocumentParser xlsxDocumentParser;

    @Autowired
    private PPTDocumentParser pptDocumentParser;

    @Autowired
    private TextDocumentParser textDocumentParser;

    @Autowired
    private WebtDocumentParser webtDocumentParser;

    @Autowired
    private SourceCodeParser sourceCodeParser;

    @Autowired
    private ConfigCodeParser configCodeParser;

    @Autowired
    private ArchiveParser archiveParser;
    @Override
    public DocumentParserInterface select(String extension) {
        extension = extension.toLowerCase();
        switch (extension) {
        case "pdf":
        case "pdfa":
            return ocrBasedPDFDocumentParser;

        case "png":
        case "bmp":
            return pngDocumentParser;
        case "jpg":
            return jpgDocumentParser;
        case "jpeg":
            return jpgDocumentParser;

        case "docx":
        case "doc":
            return docxDocumentParser;

        case "xlsx":
        case "xls":
            return xlsxDocumentParser;

        case "pptx":
            return pptDocumentParser;
        case "ppt":
            return pptDocumentParser;

        
        case "html":
        case "mhtml":
        case "htm":
            return webtDocumentParser;
        case "json":
        case "yaml":
        case "yml":
        case "toml":
        case "ini":
        case "properties":
            return configCodeParser;
        case "java":
        case "js":
        case "ts":
        case "py":
        case "sh":
        case "bash":
        case "sql":    
        case "dtd":
        case "xsd":
        case "xml":
            return sourceCodeParser;
        case "csv":
        case "log":
        case "txt":
        case "md":
            return textDocumentParser;

    
        case "zip":
        case "tar":
        case "gz":
        case "bz2":
        case "xz":
        case "7z":
        case "rar":
        case "tar.gz":
        case "tar.bz2":
        case "tar.xz":
        case "tar.7z":
        case "tar.rar":
        case "jar":
        case "war":
        case "ear":
        case "apk":
        case "ipa":
        case "deb":
        case "rpm":
        case "msi":
        case "dmg":
        case "iso":
            return archiveParser;
        case "img":
        case "vmdk":
        case "ova":
        case "ovf":
        case "vdi":
        case "vhd":
        case "vhdx":
        case "qcow2":
        case "key":
            return defaultParser;
        default:
            logger.debug("No parser found for extension: {}", extension);
            return defaultParser;
        }
    }
}