package com.wibot.markdownService;

import java.time.LocalDateTime;

import com.wibot.persistence.entity.MarkdownBasedContentPO;

/**
 * Interface representing information about a markdown paragraph.
 */
/**
 * MarkdownParagraphInfo 接口定义了一个 Markdown 段落的信息。 它包含以下方法：
 * 
 * - getCreatedDateTime(): 获取段落创建的日期和时间。 - getMarkdownBasedContent(): 获取基于
 * Markdown 的内容。 - getParagraphOrder(): 获取段落的顺序。
 */
public interface MarkdownParagraphInfo {

    LocalDateTime getCreatedDateTime();

    MarkdownBasedContentPO getMarkdownBasedContent();

    int getParagraphOrder();
}
