// package com.wibot.markdownService;

// import com.wibot.persistence.entity.MarkdownBasedContentPO;
// import com.google.gson.Gson;
// import com.google.gson.JsonArray;
// import com.google.gson.JsonElement;
// import com.google.gson.JsonObject;
// import okhttp3.HttpUrl;
// import okhttp3.MediaType;
// import okhttp3.OkHttpClient;
// import okhttp3.Request;
// import okhttp3.RequestBody;
// import okhttp3.Response;
// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;
// import org.springframework.beans.factory.annotation.Value;
// import org.springframework.stereotype.Service;

// import java.io.IOException;
// import java.util.Collections;
// import java.util.HashMap;
// import java.util.Map;
// import java.util.Random;

// public class YuqueMarkdownServiceImpl implements MarkdownServiceInterface {

// private static final Logger logger =
// LoggerFactory.getLogger(YuqueMarkdownServiceImpl.class);
// public final static int YUQUE_TITLE_LIMINATION = 200;

// @Value("${yuque.login}")
// private String login;

// @Value("${yuque.token}")
// private String token;

// @Value("${yuque.book}")
// private String book;

// public final static String baseUrl = "https://yuque-api.antfin-inc.com";
// public static final String YUQUE_URL = "https://aliyuque.antfin.com/";

// @Override
// public String storeMarkdown(MarkdownBasedContentPO markdownBasedContent) {
// String title = extractTitle(markdownBasedContent.getContent());
// YuqueLoginArgument yuqueLoginArgu = new YuqueLoginArgument(login, book,
// token, false);

// logger.info("Storing markdown content to Yuque with title: {}", title);
// String yuqueUrl = updateDocumentAndToc(title,
// markdownBasedContent.getContent(), yuqueLoginArgu);

// if (yuqueUrl != null) {
// logger.info("Markdown content stored successfully. Yuque URL: {}", yuqueUrl);
// } else {
// logger.warn("Failed to store markdown content to Yuque.");
// }

// return yuqueUrl;
// }

// private String extractTitle(String markdownContent) {
// // 提取Markdown内容中的标题，假设标题在第一行
// String[] lines = markdownContent.split("\n");
// if (lines.length > 0) {
// return lines[0].replaceAll("#", "").trim();
// }
// return "Untitled";
// }

// public String updateDocumentAndToc(String title, String contentMarkD,
// YuqueLoginArgument yuqueLoginArgu) {
// JsonElement docsFromTitle = findDocumentByTitle(title, yuqueLoginArgu);
// JsonObject docContent;
// String slugString = null;
// String id = null;
// boolean isInsert = true;

// if (docsFromTitle == null) {
// docContent = null;
// isInsert = true;
// logger.info("is null , create new yuque doc : " + title);
// } else {
// JsonObject jsonObj = docsFromTitle.getAsJsonObject();
// slugString = jsonObj.get("slug").getAsString();
// docContent = getDocumentById(slugString, yuqueLoginArgu);
// id = jsonObj.get("id").getAsString();
// isInsert = false;
// }

// if (docContent != null) {
// if
// (YuqueLoginArgument.REPLACE_MODEL_APPEND.equals(yuqueLoginArgu.getReplaceModel()))
// {
// String docContentFromYuque = docContent.get("body").getAsString();
// if (docContentFromYuque != null && docContentFromYuque.equals(contentMarkD))
// {
// StringBuilder contentnew = new StringBuilder();
// contentnew.append("文档中过去的内容：");
// contentnew.append(docContent.get("body").getAsString());
// contentnew.append("\n\n\n\n新增内容：\n");
// contentnew.append(contentMarkD);
// contentMarkD = contentnew.toString();
// }
// } else if
// (YuqueLoginArgument.REPLACE_MODEL_REPLACE.equals(yuqueLoginArgu.getReplaceModel()))
// {
// // do nothing
// } else if
// (YuqueLoginArgument.REPLACE_MODEL_SKIP.equals(yuqueLoginArgu.getReplaceModel()))
// {
// logger.warn("skip update yuque doc : " + title);
// return null;
// } else {
// logger.error("unknown replace model : " + yuqueLoginArgu.getReplaceModel());
// return null;
// }
// }

// if (contentMarkD == null || contentMarkD.equals("")) {
// if (yuqueLoginArgu.isOutputEmptyDoc()) {
// contentMarkD = "当前Q没有建议answer,请额外添加即可";
// contentMarkD += "\n#建议的anser包含几个要素 :
// 现象(用来链接用户的问题，可以有多种现象），原因（收拢原因，解释为什么会有这个现象，可选），解决办法（最终的建议解决方案，这个最重要，不要省略，步骤要完善）。
// 不建议只放链接（因为大模型本身就能看到所有的文档），既然找到这个Q/A一定是因为他认为其他文档不能解决问题。\n";
// StringBuilder sb = new StringBuilder();
// sb.append("##现象\n");
// sb.append("##原因\n");
// sb.append("##解决办法\n");
// contentMarkD += sb.toString();
// } else {
// logger.warn("skip update empty yuque doc : " + title);
// return null;
// }
// }

// if (title == null) {
// title = "";
// }
// // 截断 title
// if (title.length() > YUQUE_TITLE_LIMINATION) {
// // 截断，然后把所有的title内容放到content里面
// contentMarkD = "标题原文过长，放到内容里：\n" + title + "\n\n\n\n" + contentMarkD;
// title = title.substring(0, YUQUE_TITLE_LIMINATION);
// }

// // Create a map to hold the JSON properties
// Map<String, Object> docMap = new HashMap<>();
// docMap.put("title", title);
// docMap.put("public", "1");
// if (yuqueLoginArgu.isLarkFormat()) {
// docMap.put("format", "lake");
// docMap.put("body", buildLake(title, contentMarkD));
// } else {
// docMap.put("format", "markdown");
// docMap.put("body", contentMarkD);
// }
// if (docsFromTitle != null) {
// docMap.put("slug", slugString);
// }

// logger.info(docMap.toString());
// JsonObject docResponse = null;
// if (isInsert) {
// docResponse = sendRequest("POST", yuqueLoginArgu.getLogin() + "/" +
// yuqueLoginArgu.getBook() + "/docs",
// docMap, yuqueLoginArgu);
// } else {
// docResponse = sendRequest("PUT", yuqueLoginArgu.getLogin() + "/" +
// yuqueLoginArgu.getBook() + "/docs/" + id,
// docMap, yuqueLoginArgu);
// }
// if (docResponse == null) {
// return null;
// }

// JsonObject jsonObj = docResponse.getAsJsonObject("data");
// long docId = jsonObj.get("id").getAsLong();
// String doc = jsonObj.get("slug").getAsString();

// // Create a map for the TOC update request
// Map<String, Object> tocMap = new HashMap<>();
// tocMap.put("action", "appendNode");
// tocMap.put("action_mode", "sibling");
// tocMap.put("type", "DOC");
// tocMap.put("doc_ids", Collections.singletonList(docId));

// // Send the TOC update request
// sendRequest("PUT", yuqueLoginArgu.getLogin() + "/" + yuqueLoginArgu.getBook()
// + "/toc", tocMap, yuqueLoginArgu);

// String bookAndurl = yuqueLoginArgu.getLogin() + "/" +
// yuqueLoginArgu.getBook() + "/" + doc;
// String yuqueUrl = YUQUE_URL + bookAndurl;
// return yuqueUrl;
// }

// private JsonObject sendRequest(String method, String path, Map<String,
// Object> body,
// YuqueLoginArgument yuqueLogin) {
// return sendRequest(method, "repos", path, body, yuqueLogin.getToken());
// }

// public JsonElement findDocumentByTitle(String title, YuqueLoginArgument
// yuqueLoginArgu) {
// // Call the API to get the document list
// JsonObject response = sendRequest("GET", yuqueLoginArgu.getLogin() + "/" +
// yuqueLoginArgu.getBook() + "/toc",
// null, yuqueLoginArgu);
// if (response == null) {
// return null;
// }

// // Get the "data" array which contains the documents
// JsonArray docList = response.getAsJsonArray("data");

// // Search for the document with the given title
// for (JsonElement element : docList) {
// JsonObject doc = element.getAsJsonObject();
// String docsTitleFromYuque = doc.get("title").getAsString();
// String targetTitle = title;
// // trim
// if (docsTitleFromYuque != null) {
// docsTitleFromYuque = docsTitleFromYuque.trim();
// } else {
// docsTitleFromYuque = "";
// }
// if (targetTitle != null) {
// targetTitle = targetTitle.trim();
// if (targetTitle.length() > YUQUE_TITLE_LIMINATION) {
// title = title.substring(0, YUQUE_TITLE_LIMINATION);
// }
// }
// if (docsTitleFromYuque.equals(targetTitle)) {
// return element;
// }
// }

// // No document found with the given title
// return null;
// }

// private JsonObject sendRequest(String method, String repos, String path,
// Map<String, Object> body, String token) {

// OkHttpClient client = new OkHttpClient();
// MediaType JSON = MediaType.get("application/json; charset=utf-8");
// Gson gson = new Gson();
// // Create the URL for the API request
// HttpUrl url = new
// HttpUrl.Builder().scheme("https").host("yuque-api.antfin-inc.com").addPathSegment("api")
// .addPathSegment("v2").addPathSegment(repos).addPathSegments(path).build();

// // Create the API request
// Request.Builder requestBuilder = new
// Request.Builder().url(url).addHeader("X-Auth-Token", token);

// if (method.equals("GET")) {
// requestBuilder.get();
// } else if (method.equals("POST")) {
// String json = gson.toJson(body);
// RequestBody requestBody = RequestBody.create(JSON, json);
// requestBuilder.post(requestBody);
// } else if (method.equals("PUT")) {
// String json = gson.toJson(body);
// RequestBody requestBody = RequestBody.create(JSON, json);
// requestBuilder.put(requestBody);
// }

// int retryCount = 0;

// while (true) {
// try (Response response = client.newCall(requestBuilder.build()).execute()) {
// if (response == null || !response.isSuccessful()) {
// throw new IOException("Unexpected code " + response);
// }
// if (response == null || !response.isSuccessful()) {
// if (response.code() == 429) {
// if (retryCount == 0) {
// logger.info("Rate limit exceeded 1st, waiting for 1 min");
// Thread.sleep(60 * 1000);
// } else if (retryCount == 1) {
// logger.info("Rate limit exceeded 2nd, waiting for 5 min");
// Thread.sleep(5 * 60 * 1000);
// } else if (retryCount == 2) {
// logger.info("Rate limit exceeded 3rd, waiting for 10 min");
// Thread.sleep(60 * 60 * 1000);
// } else {
// throw new IOException("Rate limit exceeded, error code 429 has try 3 times
// break.");
// }
// retryCount++;
// continue;
// }
// throw new IOException("Unexpected code " + response);
// }

// // Parse the response body
// String responseBody = response.body().string();
// return gson.fromJson(responseBody, JsonObject.class);
// } catch (IOException | InterruptedException e) {
// logger.error("sendRequest", e);
// // Return null if an error occurred
// return null;
// }
// }
// }

// public JsonObject getDocumentById(String docId, YuqueLoginArgument
// yuqueLogin) {
// // Call the API to get the document
// JsonObject response = sendRequest("GET", yuqueLogin.getLogin() + "/" +
// yuqueLogin.getBook() + "/docs/" + docId,
// null, yuqueLogin);
// if (response == null) {
// return null;
// }

// // Return the "data" object from the response
// return response.getAsJsonObject("data");
// }

// private String buildLake(String title, String content) {
// StringBuilder sb = new StringBuilder();
// sb.append("<!doctype lake>");
// sb.append("<title>");
// sb.append(title);
// sb.append("</title>");
// sb.append("<meta name=\"doc-version\" content=\"1\" />");
// sb.append("<meta name=\"viewport\" content=\"fixed\" />");
// sb.append("<meta name=\"typography\" content=\"classic\" />");
// sb.append("<meta name=\"paragraphSpacing\" content=\"relax\" />");
// String generatedRandomID = generateRandomId();
// sb.append("<p data-lake-id=\"" + generatedRandomID + "\" id=\"" +
// generatedRandomID + "\">");
// generatedRandomID = generateRandomId();
// sb.append("<span data-lake-id=\"" + generatedRandomID + "\" id=\"" +
// generatedRandomID + "\">");
// sb.append(content);
// sb.append("</span></p>");
// return sb.toString();
// }

// public String generateRandomId() {
// String characters = "0123456789abcdef";
// StringBuilder id = new StringBuilder("u");
// Random rnd = new Random();
// for (int i = 0; i < 7; i++) {
// id.append(characters.charAt(rnd.nextInt(characters.length())));
// }
// return id.toString();
// }

// public static final class YuqueLoginArgument {
// private String login;
// private String token;
// private String book;
// private String replaceModel = REPLACE_MODEL_APPEND;
// private boolean larkFormat = true;
// private boolean outputEmptyDoc = true;
// /**
// * 用新内容替换老内容
// */
// public static final String REPLACE_MODEL_REPLACE = "replace";
// /**
// * 保留老的内容，后面增加新的内容，老的场景默认是这个选项
// */
// public static final String REPLACE_MODEL_APPEND = "append";
// /**
// * 全部保留老的内容
// */
// public static final String REPLACE_MODEL_SKIP = "skip";

// public YuqueLoginArgument(String login, String book, String token) {
// this.login = login;
// this.token = token;
// this.book = book;
// }

// public YuqueLoginArgument(String login, String book, String token, boolean
// larkFormat) {
// this.login = login;
// this.token = token;
// this.book = book;
// this.larkFormat = larkFormat;
// }

// public YuqueLoginArgument(String login, String book, String token, String
// replaceModel, boolean outputEmptyDoc,
// boolean larkFormat) {
// this.login = login;
// this.token = token;
// this.book = book;
// this.replaceModel = replaceModel;
// this.larkFormat = larkFormat;
// this.outputEmptyDoc = outputEmptyDoc;
// }

// public String getReplaceModel() {
// return replaceModel;
// }

// public boolean isOutputEmptyDoc() {
// return outputEmptyDoc;
// }

// public String getLogin() {
// return login;
// }

// public String getToken() {
// return token;
// }

// public String getBook() {
// return book;
// }

// public boolean isLarkFormat() {
// return larkFormat;
// }
// }
// }