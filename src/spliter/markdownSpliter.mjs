class MarkdownSplitUtil {
  static MAX_BATCH_SIZE_DOC_GENERATION = 5000;

  static splitContentIfNeed(content, maxsize = MarkdownSplitUtil.MAX_BATCH_SIZE_DOC_GENERATION) {
    if (content.length <= maxsize) {
      return [content];
    } else {
      return this.splitContent(content, maxsize, 1, new TitleAndSQHolder());
    }
  }

  static splitContent(content, maxsize, level, titleAndSimilarQuestionHolder) {
    const result = [];
    const sections = this.findLinesStartingWithHash(content, level);

    for (const section of sections) {
      if (section.trim().length === 0) continue;

      if (section.length > maxsize) {
        if (level < 4) {
          const subSplitedContentList = this.splitContent(section, maxsize, level + 1, titleAndSimilarQuestionHolder);
          const subSplitedContentNew = [];
          let sb = '';

          for (const subSplitedContent of subSplitedContentList) {
            if (sb.length + subSplitedContent.length < maxsize - 1) {
              sb += subSplitedContent + '\n';
            } else {
              subSplitedContentNew.push(sb);
              sb = subSplitedContent;
            }
          }

          if (sb.length > 0) {
            subSplitedContentNew.push(sb);
          }

          this.appendResultListToResultIfLessThanMaxSize(maxsize, result, subSplitedContentNew, titleAndSimilarQuestionHolder, level);
        } else {
          let remainingSection = section;
          while (remainingSection.length > maxsize - 1000) {
            result.push(remainingSection.substring(0, maxsize - 1000));
            remainingSection = remainingSection.substring(maxsize - 1000);
          }
          result.push(remainingSection);
        }
      } else {
        this.appendToResultIfLessThanMaxSize(maxsize, result, section, titleAndSimilarQuestionHolder, level);
      }
    }

    return result;
  }

  static findLinesStartingWithHash(content, level) {
    const result = [];
    const lines = content.split('\n');
    let aSection = '';
    let first = true;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('#'.repeat(level) + ' ')) {
        if (aSection.length > 0) {
          result.push(aSection);
          aSection = '';
          first = true;
        }
      }
      if (!first) {
        aSection += '\n';
      }
      first = false;
      aSection += trimmedLine;
    }

    if (aSection.length > 0) {
      result.push(aSection);
    }

    return result;
  }

  static appendResultListToResultIfLessThanMaxSize(maxsize, result, sections, titleAndSimilarQuestionHolder, level) {
    for (const section of sections) {
      this.appendToResultIfLessThanMaxSize(maxsize, result, section, titleAndSimilarQuestionHolder, level);
    }
  }

  static appendToResultIfLessThanMaxSize(maxsize, result, section, titleAndSimilarQuestionHolder, level) {
    if (result.length > 0) {
      const lastSection = result[result.length - 1];
      if (lastSection.length + section.length < maxsize - 1) {
        result[result.length - 1] = `${lastSection}\n${section}`;
        return true;
      } else {
        if (level === 1 && result.length === 1) {
          const firstSection = result[0];
          const title = this.extractTitle(firstSection);
          const similarQuestion = this.similarQuestion(firstSection);

          const titleAndSimilarQuestion = new TitleAndSimilarQuestion(title, similarQuestion);
          titleAndSimilarQuestionHolder.titleAndSimilarQuestion = titleAndSimilarQuestion;
          section = this.appendTitleAndSimilarQuesToSection(maxsize, section, titleAndSimilarQuestion);
        } else if (titleAndSimilarQuestionHolder.titleAndSimilarQuestion) {
          section = this.appendTitleAndSimilarQuesToSection(maxsize, section, titleAndSimilarQuestionHolder.titleAndSimilarQuestion);
        }
        result.push(section);
        return false;
      }
    } else {
      result.push(section);
      return false;
    }
  }

  static extractTitle(content) {
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        return line.substring(2);
      }
      if (line.startsWith('#')) {
        return line.substring(1);
      }
    }
    for (const line of lines) {
      if (line.trim().length > 0) {
        return line;
      }
    }
    return '';
  }

  static similarQuestion(content) {
    const beginMatcher = this.similarQBeginpattern.exec(content);
    const endMatcher = this.similarQEndPattern.exec(content);

    if (beginMatcher && endMatcher) {
      const start = beginMatcher.index + beginMatcher[0].length;
      const end = endMatcher.index;
      if (start < end) {
        return content.substring(start, end).trim();
      }
    }
    return '';
  }

  static appendTitleAndSimilarQuesToSection(maxsize, section, titleAndSimilarQuestion) {
    let { title, similarQuestion } = titleAndSimilarQuestion;
    let sb = '';

    if (title) {
      if (title.length > 30) {
        title = title.substring(0, 30);
      }
      sb += `# ${title}\n`;
    }

    if (similarQuestion) {
      sb += `# 类似问题:\n${similarQuestion}\n# 回答:\n`;
    }

    sb += section;
    if (sb.length >= maxsize) {
      section = sb.substring(0, maxsize - 1);
    } else {
      section = sb;
    }
    return section;
  }
}

MarkdownSplitUtil.similarQBeginpattern = /#\s*(相似问题|类似问题|类似的问题|相似的问题)\s*[:： ]?/;
MarkdownSplitUtil.similarQEndPattern = /#\s*(回答|答案)\s*[:： ]?/;

class TitleAndSQHolder {
  constructor() {
    this.titleAndSimilarQuestion = null;
  }
}

class TitleAndSimilarQuestion {
  constructor(title, similarQuestion) {
    this.title = title;
    this.similarQuestion = similarQuestion;
  }
}

export default MarkdownSplitUtil;
