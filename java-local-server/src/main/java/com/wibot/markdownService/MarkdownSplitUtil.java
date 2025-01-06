package com.wibot.markdownService;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class MarkdownSplitUtil {

    private static Logger logger = LoggerFactory.getLogger(MarkdownSplitUtil.class);

    /**
     * 生成的时候还是先暂时按5000来
     */
    public static final int MAX_BATCH_SIZE_DOC_GENERATION = 5000;

    public static List<String> splitContentIfNeed(String content) {
        return splitContentIfNeed(content, MAX_BATCH_SIZE_DOC_GENERATION);
    }

    public static List<String> splitContentIfNeed(String content, int maxsize) {
        List<String> sections;
        if (content.length() <= maxsize) {
            // 如果文档长度小于maxsize，那么就不需要分割
            sections = Arrays.asList(content);
        } else {
            // 如果文档长度大于maxsize，那么就需要分割

            // 先构建一个列表，因为level是从1开始的，所以这里默认加了一个null，防止index out of bounds
            TitleAndSQHolder titleAndSimilarQuestionHolder = new TitleAndSQHolder();
            sections = splitContent(content, maxsize, 1, titleAndSimilarQuestionHolder);
        }
        return sections;
    }

    // 分割文档
    private static List<String> splitContent(String content, int maxsize, int level,
            TitleAndSQHolder titleAndSimilarQuestionHolder) {

        List<String> result = new ArrayList<>();

        List<String> sections = findLinesStartingWithHash(content, level);

        for (String section : sections) {
            if (section.trim().isEmpty()) {
                continue;
            }
            if (section.length() > maxsize) {
                if (level < 5) {
                    /*
                     * 增加黏着： 过去分块： 块1 # title (10个字） 块2 ## sub title（1000个字） 块3 content （3000个字） 块4
                     * content1 （3000个字）
                     * 
                     * 新的分块： 块1 # title (4010个字） ## sub title ## content 块2 content1 （3000个字）
                     */
                    List<String> subSplitedContentList = splitContent(section, maxsize, level + 1,
                            titleAndSimilarQuestionHolder);
                    List<String> subSplitedContentNew = new ArrayList<>();
                    StringBuilder sb = new StringBuilder();
                    for (String subSplitedContent : subSplitedContentList) {

                        if (sb.length() + subSplitedContent.length() < maxsize - 1) {
                            sb.append(subSplitedContent);
                            sb.append("\n");
                        } else {
                            subSplitedContentNew.add(sb.toString());
                            sb = new StringBuilder();
                            sb.append(subSplitedContent);
                        }
                    }
                    if (sb.length() > 0) {
                        subSplitedContentNew.add(sb.toString());
                    }
                    appendResultListToResultIfLessThanMaxSize(maxsize, result, subSplitedContentNew,
                            titleAndSimilarQuestionHolder, level);
                } else {
                    while (section.length() > maxsize - 1000) {
                        // 这里的处理方式是因为我也没办法算如果内容直接切分以后，需要给多少个字节的黏着，所以切分的激进一些，预留1000个字符给前面的各类title。
                        // 最理想状态是不走到这里
                        result.add(section.substring(0, maxsize - 1000));
                        section = section.substring(maxsize - 1000);
                    }
                    result.add(section);
                }
            } else {
                /*
                 * 增加黏着： 过去分块： 块1 # title (10个字） 块2 ## sub title（1000个字） 块3 ## sub title 1
                 * （1000个字） 块4 ## sub title 2 （3000个字）
                 * 
                 * 新的分块： 块1 # title (2010个字） ## sub title ## sub title 1 块2 ## sub title 2
                 * （3000个字）
                 */
                appendToResultIfLessThanMaxSize(maxsize, result, section, titleAndSimilarQuestionHolder, level);
            }
        }

        return result;
    }

    private static List<String> findLinesStartingWithHash(String content, int level) {
        List<String> result = new ArrayList<>();
        String[] lines = content.split("\n");
        StringBuilder aSection = new StringBuilder();
        boolean first = true;
        for (String line : lines) {
            line = line.trim();
            if (line.startsWith(repeat("#", level) + " ")) {
                if (aSection.length() > 0) {
                    result.add(aSection.toString());
                    aSection = new StringBuilder();
                    first = true;
                }
            }
            if (first) {
                first = false;
            } else {
                aSection.append("\n");
            }
            aSection.append(line);

        }
        if (aSection.length() > 0) {
            result.add(aSection.toString());
        }
        return result;
    }

    private static void appendResultListToResultIfLessThanMaxSize(int maxsize, List<String> result,
            List<String> sections, TitleAndSQHolder titleAndSimilarQuestionHolder, int level) {
        for (String section : sections) {
            appendToResultIfLessThanMaxSize(maxsize, result, section, titleAndSimilarQuestionHolder, level);
        }

    }

    private static boolean appendToResultIfLessThanMaxSize(int maxsize, List<String> result, String section,
            TitleAndSQHolder titleAndSimilarQuestionHolder, int level) {
        if (result.size() > 0) {
            String lastSection = result.get(result.size() - 1);
            if (lastSection.length() + section.length() < maxsize - 1) {
                result.set(result.size() - 1, lastSection + "\n" + section);
                return true;
            } else {
                if (level == 1 && result.size() == 1) {
                    // 第一个section 从里面取title + similar question
                    // 取第一个# 后面的作为title

                    String firstSection = result.get(0);
                    String[] lines = firstSection.split("\n");
                    String title = "";
                    for (String line : lines) {
                        if (line.startsWith("# ")) {
                            title = line.substring(2);
                            break;
                        }
                        // 为yuque单独搞的，他少个空格
                        if (line.startsWith("#")) {
                            title = line.substring(1);
                            break;
                        }
                    }
                    if (title.isEmpty()) {
                        // 如果没有title，那么就取非空的第一行
                        for (String line : lines) {
                            if (!line.trim().isEmpty()) {
                                title = line;
                                break;
                            }
                        }
                    }

                    String similarQuestion = similarQuestion(firstSection);

                    TitleAndSimilarQuestion titleAndSimilarQuestion = new TitleAndSimilarQuestion();
                    titleAndSimilarQuestion.setTitle(title);
                    titleAndSimilarQuestion.setSimilarQuestion(similarQuestion);
                    titleAndSimilarQuestionHolder.setTitleAndSimilarQuestion(titleAndSimilarQuestion);
                    section = appendTitleAndSimilarQuesToSection(maxsize, section, titleAndSimilarQuestion);
                } else if (titleAndSimilarQuestionHolder.getTitleAndSimilarQuestion() != null) {
                    // 如果不是第一个section，那么就取上一个section的title + similar question
                    TitleAndSimilarQuestion titleAndSimilarQuestion = titleAndSimilarQuestionHolder
                            .getTitleAndSimilarQuestion();
                    section = appendTitleAndSimilarQuesToSection(maxsize, section, titleAndSimilarQuestion);
                } else if (level != 1) {
                    // 正常的情况，目前只支持一级目录的title + similar question
                } else {
                    logger.error("没找到title ? 不应该啊");
                    logger.error(section);
                    logger.error(lastSection);
                }
                result.add(section);
                return false;
            }
        } else {

            result.add(section);
            return false;
        }
    }

    private static String appendTitleAndSimilarQuesToSection(int maxsize, String section,
            TitleAndSimilarQuestion titleAndSimilarQuestion) {
        String title = titleAndSimilarQuestion.getTitle();
        String similarQuestion = titleAndSimilarQuestion.getSimilarQuestion();
        StringBuilder sb = new StringBuilder();
        if (title != null) {
            if (title.length() > 30) {
                title = title.substring(0, 30);
            }
            sb.append("# " + title);
            sb.append("\n");
        }

        if (similarQuestion != null && !similarQuestion.isEmpty()) {
            sb.append("# 类似问题:");
            sb.append("\n");
            sb.append(similarQuestion);
            sb.append("# 回答:");
            sb.append("\n");
        }

        sb.append(section);
        if (sb.length() >= maxsize) {
            logger.info("sb.length() >= maxsize , 硬切分？");
            section = sb.toString().substring(0, maxsize - 1);
        } else {
            section = sb.toString();
        }
        return section;
    }

    private static String repeat(String str, int times) {
        if (times < 0) {
            return "";
        }
        return new String(new char[times]).replace("\0", str);
    }

    // 取相似问题 ， 类似问题， 不包含 " 相似问题，类似问题" 这样的标题，只含有内容
    private static String similarQuestion(String content) {

        Matcher matcher = getMatcherBegin(content);

        Matcher endMatcher = getMatcherEnd(content);

        String between = null;
        if (matcher.find() && endMatcher.find()) {
            int start = matcher.end();
            int end = endMatcher.start();
            if (start < end) {
                between = content.substring(start, end);
            } else {
                between = "";
            }
        }
        return between;
    }

    private static Matcher getMatcherEnd(String content) {
        Matcher endMatcher = similarQEndPattern.matcher(content);
        return endMatcher;
    }

    private static Pattern similarQBeginpattern = Pattern.compile("#\\s*(相似问题|类似问题|类似的问题|相似的问题)\\s*[:： ]?");
    private static Pattern similarQEndPattern = Pattern.compile("#\\s*(回答|答案)\\s*[:： ]?");

    private static Matcher getMatcherBegin(String content) {
        Matcher matcher = similarQBeginpattern.matcher(content);
        return matcher;
    }

    private static class TitleAndSQHolder {
        private TitleAndSimilarQuestion titleAndSimilarQuestion;

        public TitleAndSimilarQuestion getTitleAndSimilarQuestion() {
            return titleAndSimilarQuestion;
        }

        public void setTitleAndSimilarQuestion(TitleAndSimilarQuestion titleAndSimilarQuestion) {
            this.titleAndSimilarQuestion = titleAndSimilarQuestion;
        }

    }

    private static class TitleAndSimilarQuestion {
        private String title;
        private String similarQuestion;

        public String getTitle() {
            return title;
        }

        public void setTitle(String title) {
            this.title = title;
        }

        public String getSimilarQuestion() {
            return similarQuestion;
        }

        public void setSimilarQuestion(String similarQuestion) {
            this.similarQuestion = similarQuestion;
        }

    }

}
