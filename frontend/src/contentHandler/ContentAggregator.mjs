import ContentCrawler from './contentCrawler.mjs';
import MarkdownSplitUtil from '../spliter/markdownSpliter.mjs';
import stringSimilarity from 'string-similarity';

class ContentAggregator {
  constructor() {
  }

  async init(globalContext) {
    this.globalContext = globalContext;
  }

  async aggregateContent(summaryList) {
    const configHandler = this.globalContext.configHandler;
    const globalConfig = await configHandler.getGlobalConfig();
    const pageFetchLimit = globalConfig.pageFetchLimit || 5;
    const browserConcurrency = globalConfig.browserConcurrency || pageFetchLimit;

    const limitedSummaryList = summaryList.slice(0, pageFetchLimit);
    const promises = limitedSummaryList.map(async (summary, index) => {
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 301)));

      const crawler = new ContentCrawler(this.globalContext);
      const content = await crawler.fetchPageContent(summary.url);
      summary.content = this.extractRelevantContent(content, summary);
      summary.paragraphOrder = index + 1;
      return summary;
    });

    const results = [];
    for (let i = 0; i < promises.length; i += browserConcurrency) {
      const chunk = promises.slice(i, i + browserConcurrency);
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
