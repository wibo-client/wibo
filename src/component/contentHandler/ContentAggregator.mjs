import ContentCrawler from './contentCrawler.mjs';

class ContentAggregator {
  constructor() {
    this.crawler = new ContentCrawler();
  }

  async aggregateContent(summaryList) {
    const promises = summaryList.map(async (summary) => {
      const content = await this.crawler.fetchPageContent(summary.url);
      summary.content = this.extractRelevantContent(content, summary);
      return summary;
    });

    return await Promise.all(promises);
  }

  extractRelevantContent(content, summary) {
    // 示例逻辑：根据摘要中的标题或其他信息提取最相关的部分
    const lines = content.split('\n');
    const relevantLines = lines.filter(line => line.includes(summary.title) || line.includes(summary.date));
    return relevantLines.join('\n');
  }
}
这个地方要重新写一下。阿斯蒂芬阿斯顿发斯蒂芬
export default ContentAggregator;
