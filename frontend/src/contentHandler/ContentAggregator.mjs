import MarkdownSplitUtil from '../spliter/markdownSpliter.mjs';
import stringSimilarity from 'string-similarity';
import logger from '../utils/loggerUtils.mjs';

class ContentAggregator {
  constructor() {
  }

  async init(globalContext) {
    this.globalContext = globalContext;
  }

  async aggregateContent(summaryList) {
    const configHandler = this.globalContext.configHandler;
    const pageFetchLimit = await configHandler.getPageFetchLimit();

    //const limitedSummaryList = summaryList.slice(0, pageFetchLimit);
    const promises = summaryList.map(async (summary, index) => {
      await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 301)));

      const crawler = this.globalContext.contentCrawler;
      const { content, realUrl } = await crawler.fetchPageContent(summary.url);
      summary.content = this.extractRelevantContent(content, summary);
      summary.realUrl = realUrl;  // 添加真实链接
      summary.paragraphOrder = index + 1;
      return summary;
    });

    const results = await Promise.all(promises);
    return results;
  }

  extractRelevantContent(content, summary) {
    logger.debug(`Extracting relevant content for ${content}`);
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
      logger.debug(`Comparing: ${section} with ${targetText}`);
      const similarity = stringSimilarity.compareTwoStrings(section, targetText);
      if (similarity > highestSimilarity) {
        logger.debug(`Found better match: ${section}`);
        highestSimilarity = similarity;
        bestMatch = section;
      }

    });

    return bestMatch;
  }
}

export default ContentAggregator;
