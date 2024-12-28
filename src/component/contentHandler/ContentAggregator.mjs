import ContentCrawler from './contentCrawler.mjs';
import MarkdownSplitUtil from '../spliter/markdownSpliter.mjs';
import { JaccardSimilarity } from 'string-similarity';
import stringSimilarity from 'string-similarity';

class ContentAggregator {
  constructor() {
    this.crawler = new ContentCrawler();
  }

  async aggregateContent(summaryList) {
    const promises = summaryList.map(async (summary,index) => {
      const content = await this.crawler.fetchPageContent(summary.url);
      summary.content = this.extractRelevantContent(content, summary);
      summary.paragraphOrder = index+1;
      return summary;
    });

    return await Promise.all(promises);
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
