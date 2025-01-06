// package com.wibot.documentLoader;

// import java.io.IOException;
// import java.security.NoSuchAlgorithmException;
// import java.util.List;
// import java.util.Map;

// import org.springframework.web.multipart.MultipartFile;

// /**
// * 文档加载器接口 提供文档加载、MD5校验、文件上传和索引状态检查等功能
// */
// public interface DocumentsLoaderInterface {

// /**
// * 根据文件路径检查MD5值是否匹配
// *
// * @param path 文件路径
// * @param md5 需要校验的MD5值
// * @return 如果MD5值匹配返回true，否则返回false
// */
// public boolean checkMD5ByPath(String path, String md5);

// /**
// * 检查文档是否已被索引 通过查询文档的处理状态判断是否已完成索引
// *
// * @param path 文档路径
// * @return 如果文档已被索引返回true，否则返回false
// */
// boolean isDocumentIndexed(String path);

// /**
// * 检查文档是否已被删除
// *
// * @param path 文档路径
// * @return 如果文档已被删除返回true，否则返回false
// */
// boolean isDocumentDeleted(String path);

// /**
// * 根据path刷新文档索引
// *
// * @param path
// * @return
// */
// public void adminRefreshDocumentIndex(String path);

// }
