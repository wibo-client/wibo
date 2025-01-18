export default class ReferenceHandler {
  constructor() {
    this.MAX_CONTENT_SIZE = 28720;
  }

  async init(globalContext) {
    this.globalContext = globalContext;
  }

  async handleSearchResults(message, path, selectedPlugin, sendSystemLog) {
    const searchItemNumbers = await this.globalContext.configHandler.getSearchItemNumbers();


    const seenUrls = new Set();
    let searchResults = [];



    sendSystemLog('🔄 开始重写查询...');

    const requeryResult = await selectedPlugin.rewriteQuery(message);

    sendSystemLog(`✅ 查询重写完成，生成 ${requeryResult.length} 个查询`);


    for (const query of requeryResult) {
      if (searchResults.length >= searchItemNumbers) {
        sendSystemLog(`📊 已达到搜索结果数量限制: ${searchItemNumbers}`);
        break;
      }

      // 添加更友好的查询日志输出
      const queryLog = `🔍 执行查询:
            • 原始查询: ${query.originalQuery}
            • 精确匹配: ${query.exactPhrases?.join(', ') || '无'}
            • 必需词: ${query.requiredTerms?.join(', ') || '无'}
            • 可选词: ${query.optionalTerms?.join(', ') || '无'}
           `;
      sendSystemLog(`${queryLog}`);

      const result = await selectedPlugin.search(query, path);
      const rerankedResult = await this.globalContext.rerankImpl.rerank(result, query);

      // 去重并添加结果
      for (const item of rerankedResult) {
        if (!seenUrls.has(item.id)) {
          seenUrls.add(item.id);
          searchResults.push(item);

          if (searchResults.length >= searchItemNumbers) {
            break;
          }
        }
      }
    }

    sendSystemLog(`✅ 搜索完成，获取到 ${searchResults.length} 个唯一结果`);
    return searchResults;
  }



  async handleAggregatedContent(searchResults, message, selectedPlugin, sendSystemLog) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const aggregatedContent = await selectedPlugin.fetchAggregatedContent(searchResults);
        let currentLength = 0;
        let partIndex = 1;
        const tasks = [];
        const maxConcurrentTasks = 2;
        const groupAnswers = [];
        const todoTasksRef = [];

        const createJsonPrompt = (jsonReference, message) => {
          const prompt = `请基于 参考信息 references 里的内容，提取有助于回答问题的关键事实，
            严格按照要求回答问题，不需要有其他任何解释说明性反馈，不需要你的判断和解释。
            要求：
            1. 回答中尽可能使用原文内容，包含详细数据和 URL 地址等，不要漏掉数据和连接。
            2. 额外澄清依据的文件路径（即 doc.realUrl）。
            3. 用 JSON 格式返回答案，格式如下：
            {
              "answer": [
                {
                  "fact": "提取的关键事实1",
                  "url": "对应的URL1",
                  "source": "第1篇参考内容"
                },
                {
                  "fact": "提取的关键事实2",
                  "url": "对应的URL2",
                  "source": "第2篇参考内容"
                }
              ]
            }
            4. 如参考信息 references 不足以回答问题返回空的Answer json对象即可。
            
            问题：
            ${message}`;

          return {
            prompt: prompt,
            references: jsonReference
          };
        };

        const createJsonReference = (doc) => {
          return {
            part: `第${partIndex++}篇参考内容`,
            title: doc.title,
            content: doc.content,
            url: doc.realUrl,
            paragraphOrder: doc.paragraphOrder,
            date: doc.date
          };
        }

        for (const doc of aggregatedContent) {
          const jsonReference = createJsonReference(doc);

          let jsonStr = JSON.stringify(jsonReference, null, 2);
          if (currentLength + jsonStr.length < this.MAX_CONTENT_SIZE) {
            todoTasksRef.push(jsonReference);
            currentLength += jsonStr.length;
            continue;
          } else {
            const jsonPrompt = createJsonPrompt(todoTasksRef, message);
            tasks.push(async () => {
              sendSystemLog(`🤖 分析内容...`);
              let groupAnswer;
              for (let i = 0; i < 3; i++) {
                try {
                  groupAnswer = await this.globalContext.llmCaller.callSync([{ role: 'user', content: JSON.stringify(jsonPrompt, null, 2) }]);
                  break;
                } catch (error) {
                  console.error(`Error in LLM call attempt ${i + 1}:`, error);
                }
              }
              if (groupAnswer) {
                groupAnswers.push(groupAnswer.join(''));
                sendSystemLog('✅ 内容分析完成');
              } else {
                sendSystemLog('❌ 内容分析失败');

              }
            });
            if (tasks.length >= maxConcurrentTasks) {
              await Promise.all(tasks.map(task => task()));
              tasks.length = 0;
            }
            todoTasksRef.length = 0;
            currentLength = 0;
          }
        }

        if (todoTasksRef.length > 0) {
          const jsonPrompt = createJsonPrompt(todoTasksRef, message);
          tasks.push(async () => {
            sendSystemLog(`🤖 分析内容...`);
            let groupAnswer;
            for (let i = 0; i < 3; i++) {
              try {
                groupAnswer = await this.globalContext.llmCaller.callSync([{ role: 'user', content: JSON.stringify(jsonPrompt, null, 2) }]);
                break;
              } catch (error) {
                console.error(`Error in LLM call attempt ${i + 1}:`, error);
              }
            }
            if (groupAnswer) {
              groupAnswers.push(groupAnswer.join(''));
              sendSystemLog('✅ 内容分析完成');
            } else {
              sendSystemLog('❌ 内容分析失败,一般是因为模型返回不符合预期');
              console.error('Error in LLM call attempt:', groupAnswer);
            }
          });
        }

        await Promise.all(tasks.map(task => task()));

        // 解析 JSON 并提取 fact
        const parsedFacts = [];
        const seenUrls = new Set();
        let hasValidResponse = false;

        // ...existing code...
        for (const answer of groupAnswers) {
          try {
            // 预处理 JSON 字符串，移除可能的 Markdown 代码块标记
            let jsonString = answer;
            if (answer.includes('```json')) {
              jsonString = answer
                .replace(/```json\n/g, '') // 移除开始的 ```json
                .replace(/```(\n)?$/g, ''); // 移除结束的 ```
            }

            // 尝试解析 JSON
            const jsonResponse = JSON.parse(jsonString.trim());

            // 检查是否有 answer 属性且为数组
            if (jsonResponse.answer && Array.isArray(jsonResponse.answer)) {
              // 如果数组不为空，则处理其中的内容
              if (jsonResponse.answer.length > 0) {
                hasValidResponse = true;
                for (const item of jsonResponse.answer) {
                  if (item.fact && item.url) { // 确保必要的字段存在
                    parsedFacts.push({
                      fact: item.fact,
                      urls: Array.isArray(item.url) ? item.url : [item.url],
                    });
                  }
                }
              }
              // 即使是空数组，也标记为有效响应（因为这是预期的格式）
              hasValidResponse = true;
            }
          } catch (error) {
            console.error('Error parsing JSON response:', error);
            console.error('Raw response:', answer);
            continue;
          }
        }
        // ...existing code...

        if (hasValidResponse) {
          sendSystemLog(`✅ 成功解析 ${parsedFacts.length} 条事实`);
          return parsedFacts;
        } else {
          throw new Error('No valid responses found in the current attempt');
        }

      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        sendSystemLog(`⚠️ 第 ${attempt + 1} 次尝试失败，${attempt < 2 ? '正在重试...' : '停止重试'}`);

        if (attempt === 2) {
          throw new Error('内容聚合失败，请重试或检查输入');
        }
      }
    }
  }

  async refineBatch(currentBatch, message, sendSystemLog) {
    const batchContent = currentBatch.join('\n\n--- 分割线 ---\n\n');
    const prompt = `请基于以下内容进行精炼，保留所有重要信息，消除重复内容，保持逻辑连贯。要求：1. 保留所有重要信息 2. 消除重复内容 3. 保持逻辑连贯\n\n${batchContent}\n\n请基于以上内容，回答问题：${message}`;

    sendSystemLog(`🔄 正在精炼内容...`);
    let refinedAnswer;
    for (let j = 0; j < 3; j++) {
      try {
        refinedAnswer = await this.globalContext.llmCaller.callSync([{ role: 'user', content: prompt }]);
        break;
      } catch (error) {
        console.error(`Error in LLM call attempt ${j + 1}:`, error);
      }
    }

    if (refinedAnswer) {
      sendSystemLog('✅ 内容精炼完成');
      // 确保返回数组形式
      const result = refinedAnswer.join('').split('\n\n--- 分割线 ---\n\n');
      return Array.isArray(result) ? result : [result];
    } else {
      sendSystemLog('❌ 内容精炼失败');
      return null;
    }
  }

  async refineParsedFacts(parsedFacts, message, sendSystemLog) {
    // 1. 提取所有 URL，并保持原始顺序
    const allUrls = Array.from(new Set(
      parsedFacts.flatMap(fact => fact.urls)
    ));

    // 2. 检查是否需要精炼
    const factsContent = parsedFacts.map(fact => fact.fact);
    const totalLength = factsContent.join('').length;

    if (totalLength <= this.MAX_CONTENT_SIZE) {
      // 如果内容长度已经符合要求，直接返回
      return {
        fact: factsContent.join('\n\n'),
        urls: allUrls
      };
    }

    // 3. 需要精炼的情况
    let refinedContent = factsContent;
    for (let i = 0; i < 3; i++) {
      const currentLength = refinedContent.join('').length;
      if (currentLength <= this.MAX_CONTENT_SIZE) {
        break;
      }

      let newRefinedContent = [];
      let currentBatch = [];

      // 按批次处理内容
      for (const content of refinedContent) {
        if (currentBatch.join(' ').length + content.length <= this.MAX_CONTENT_SIZE) {
          currentBatch.push(content);
        } else {
          const refinedBatch = await this.refineBatch(currentBatch, message, sendSystemLog);
          if (refinedBatch === null) {
            break;
          }
          newRefinedContent = newRefinedContent.concat(refinedBatch);
          currentBatch = [content];
        }
      }

      // 处理剩余的批次
      if (currentBatch.length > 0) {
        const refinedBatch = await this.refineBatch(currentBatch, message, sendSystemLog);
        if (refinedBatch !== null) {
          newRefinedContent = newRefinedContent.concat(refinedBatch);
        }
      }

      refinedContent = newRefinedContent;
    }

    // 4. 返回精炼后的结果
    return {
      fact: refinedContent.join('\n\n'),
      urls: allUrls
    };
  }

  async buildPromptFromContent(aggregatedContent, message) {
    const contextBuilder = [];
    let currentLength = 0;
    let partIndex = 1;

    for (const doc of aggregatedContent) {
      if (partIndex > 10) break;

      let partHeader = '';
      if (doc.date) {
        partHeader = `\n# 第${partIndex++}篇参考内容（来自文件路径：${doc.realUrl} 的 第 ${doc.paragraphOrder} 段 ,发布时间是 ${doc.date} ）：\n\n`;
      } else {
        partHeader = `\n# 第${partIndex++}篇参考内容（来自文件路径：${doc.realUrl} 的 第 ${doc.paragraphOrder} 段）：\n\n`;
      }

      const combinedContent = `${partHeader} \n ## title :${doc.title}\n\n${doc.description}\n\n ## 详细内容：\n${doc.content}`;

      if (currentLength + combinedContent.length > this.MAX_CONTENT_SIZE) {
        contextBuilder.push(combinedContent.substring(0, this.MAX_CONTENT_SIZE - currentLength));
        currentLength = combinedContent.length - (this.MAX_CONTENT_SIZE - currentLength);
        contextBuilder.push(combinedContent.substring(this.MAX_CONTENT_SIZE - currentLength));
      } else {
        contextBuilder.push(combinedContent);
        currentLength += combinedContent.length;
      }
    }

    const suggestionContext = contextBuilder.join('');
    return `尽可能依托于如下参考信息：\n${suggestionContext}\n\n处理用户的请求：\n${message}`;
  }
}
