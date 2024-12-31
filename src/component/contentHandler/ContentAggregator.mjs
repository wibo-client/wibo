import ContentCrawler from './contentCrawler.mjs';
import MarkdownSplitUtil from '../spliter/markdownSpliter.mjs';
import stringSimilarity from 'string-similarity';
import ConfigKeys from '../../config/configKeys.mjs';

class ContentAggregator {
  constructor() {
    this.browserConcurrency = 1; // 默认并发数
  }

  init(globalContext) {
    this.globalConfig = globalContext.globalConfig;
    const pageFetchLimit = this.globalConfig[ConfigKeys.PAGE_FETCH_LIMIT] || 5; // 默认值为10
    this.browserConcurrency = this.globalConfig[ConfigKeys.BROWSER_CONCURRENCY] || pageFetchLimit;
    this.pageFetchLimit = pageFetchLimit;
    this.crawler = new ContentCrawler(this.globalConfig); // 传递 globalConfig
  }

  async aggregateContent(summaryList) {
    const limitedSummaryList = summaryList.slice(0, this.pageFetchLimit); // 根据 pageFetchLimit 取任务
    const promises = limitedSummaryList.map(async (summary, index) => {
      const content = await this.crawler.fetchPageContent(summary.url);
      summary.content = this.extractRelevantContent(content, summary);
      summary.paragraphOrder = index + 1;
      return summary;
    });

    const results = [];
    for (let i = 0; i < promises.length; i += this.browserConcurrency) {
      const chunk = promises.slice(i, i + this.browserConcurrency);
      results.push(...await Promise.all(chunk));
    }

    return results;
  }

  extractRelevantContent(content, summary) {
    const sections = MarkdownSplitUtil.splitContentIfNeed(content);
    let matchingParagraph = null;
    if (summary.description) {
      matchingParagraph = this.findMatchingParagraph(sections, summary.description);
    } else {
      matchingParagraph = this.findMatchingParagraph(sections, summary.title);
    }
    return matchingParagraph;
  }

  findMatchingParagraph(sections, targetText) {
    let bestMatch = null;
    let highestSimilarity = 0;

    sections.forEach(section => {
      const similarity = stringSimilarity.compareTwoStrings(section, targetText);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = section;
      }
    });

    return bestMatch;
  }
}

export default ContentAggregator;
