import { JsonUtils } from '../utils/jsonUtils.mjs';

export default class ReferenceHandler {
  constructor() {
    this.MAX_CONTENT_SIZE = 28720;
  }

  async init(globalContext) {
    this.globalContext = globalContext;
  }

  buildReferenceData(aggregatedContent) {
    return {
      fullContent: aggregatedContent.map((doc, index) => ({
        index: index + 1,
        title: doc.title,
        url: doc.realUrl,
        date: doc.date,
        description: doc.description
          .replace(/<\/?h[1-6][^>]*>/gi, "") // 去掉所有的 <h1> 到 <h6> 标签
          .replace(/\n/g, " ") // 去掉所有的换行符
          .replace(/<br\s*\/?>/gi, " ") // 去掉所有的 <br> 标签
          .replace(/^#{1,6}\s+/gm, "") // 去掉所有的 # ## ### ....#####
      })),
      totalCount: aggregatedContent.length
    };
  }


  async searchAndRerank(message, path, selectedPlugin, sendSystemLog) {
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
      sendSystemLog(query.queryLog);

      const result = await selectedPlugin.search(query.query, path);
      const rerankedResult = await this.globalContext.rerankImpl.rerank(result, query.query);

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

  async fetchDetails(searchResults, selectedPlugin, sendSystemLog) {
    sendSystemLog('📑 获取详细内容...');
    if (!searchResults || searchResults.length === 0) {
      sendSystemLog('ℹ️ 未找到相关内容');
      return [];
    }
    const detailsSearchResults = await selectedPlugin.fetchAggregatedContent(searchResults);
    sendSystemLog(`✅ 获取到 ${detailsSearchResults.length} 个详细内容，开始回答问题，你可以通过调整 [单次查询详情页抓取数量] 来调整依托多少内容来回答问题`);
    return detailsSearchResults;
  }


  async extractKeyFacts(detailsSearchResults, message, sendSystemLog) {

    for (let attempt = 0; attempt < 3; attempt++) {
      try {

        // 检查聚合内容是否为空
        if (!detailsSearchResults || detailsSearchResults.length === 0) {
          sendSystemLog('ℹ️ 无法获取详细内容');
          return [];
        }

        let currentLength = 0;
        let partIndex = 1;
        const tasks = [];
        const maxConcurrentTasks = 2;
        const groupAnswers = [];
        const todoTasksRef = [];

        const createJsonPrompt = (jsonReference, message) => {
          const prompt = `请基于 参考信息 references 里的内容，提取有助于回答问题的关键事实，
            
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
            4. 如参考信息 references 不足以回答问题返回空的Answer json对象,格式如下：
            {
              "answer": []
            } 
            5.严格按照要求回答问题，不需要有其他任何解释说明性反馈，不需要你的判断和解释。
            
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

        for (const doc of detailsSearchResults) {
          const jsonReference = createJsonReference(doc);

          let jsonStr = JSON.stringify(jsonReference, null, 2);
          if (currentLength + jsonStr.length < this.MAX_CONTENT_SIZE) {
            todoTasksRef.push(jsonReference);
            currentLength += jsonStr.length;
            continue;
          } else {
            const jsonPrompt = createJsonPrompt(todoTasksRef, message);
            tasks.push(async () => {
              sendSystemLog(`🤖 分析内容（本步骤较慢，多等一下）...`);
              let groupAnswer;
              for (let i = 0; i < 3; i++) {
                try {
                  groupAnswer = await this.callLLMRemoteSync([{
                    role: 'user',
                    content: JSON.stringify(jsonPrompt, null, 2)
                  }]);
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
            sendSystemLog(`🤖 分析内容（本步骤较慢，多等一下）...`);
            let groupAnswer;
            for (let i = 0; i < 3; i++) {
              try {
                groupAnswer = await this.callLLMRemoteSync([{
                  role: 'user',
                  content: JSON.stringify(jsonPrompt, null, 2)
                }]);
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
        let hasValidResponse = false;

        for (const answer of groupAnswers) {
          try {
            const jsonString = JsonUtils.extractJsonFromResponse(answer);
            if (!jsonString) {
              console.error('无法提取有效的JSON字符串:', answer);
              continue;
            }

            const jsonResponse = JSON.parse(jsonString);

            // 验证 JSON 结构
            if (jsonResponse && typeof jsonResponse === 'object' && 'answer' in jsonResponse) {
              hasValidResponse = true;

              if (Array.isArray(jsonResponse.answer)) {
                for (const item of jsonResponse.answer) {
                  if (item?.fact && item?.url) {
                    parsedFacts.push({
                      fact: item.fact,
                      urls: Array.isArray(item.url) ? item.url : [item.url],
                    });
                  }
                }
              }
            } else {
              console.error('JSON响应格式不符合预期:', jsonResponse);
            }
          } catch (error) {
            console.error('JSON解析错误:', {
              error: error.message,
              stack: error.stack,
              rawResponse: answer
            });
            continue;
          }
        }

        // 改进的结果处理逻辑
        if (hasValidResponse) {
          const resultMessage = parsedFacts.length > 0
            ? `✅ 成功解析 ${parsedFacts.length} 条事实`
            : '✅ 未发现相关事实';
          sendSystemLog(resultMessage);
          return parsedFacts;
        }

        // 如果没有有效响应，但还有重试机会
        if (attempt < 2) {
          throw new Error('未获得有效响应，准备重试');
        }

        // 最后一次尝试也失败了，返回空数组
        sendSystemLog('ℹ️ 未能获取有效内容');
        return [];

      } catch (error) {
        console.error(`第 ${attempt + 1} 次尝试失败:`, error.message);
        sendSystemLog(`⚠️ 第 ${attempt + 1} 次尝试失败，${attempt < 2 ? '正在重试...' : ''}`);

        if (attempt === 2) {
          return [];
        }
      }
    }

    return [];
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


  async buildSearchResultsString(searchResults) {
    let sb = '';
    let fileNumber = 1;
    searchResults.forEach(result => {
      sb += `#### index ${fileNumber++} 标题 ： [${result.title}](${result.url})\n\n`;

      sb += `${result.description}\n`;
      if (result.date) {
        sb += `${result.date}\n`;
      }
    });
    return sb;
  }

  async callLLMRemoteAsync(messages, sendSystemLog, sendLLMStream) {
    try {
      const serverInfo = await this.globalContext.localServerManager.getCurrentServerInfo();
      if (!serverInfo.isHealthy || !serverInfo.port) {
        throw new Error('本地服务器未启动,请在管理界面中启动本地知识库服务');
      }

      const formattedMessages = messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }));

      const response = await fetch(`http://localhost:${serverInfo.port}/chat/streamCall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: formattedMessages
        })
      });

      if (!response.ok) {
        if (response.status === 401) {
          sendSystemLog('❌ 未授权：请在管理界面中输入API密钥');
          throw new Error('Unauthorized: 请在管理界面中输入API密钥');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receiveBuffer = [];
      let lastAvailableChunk = [];

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // 处理最后的缓冲区数据
          if (receiveBuffer.length > 0) {
            const finalData = this.processStreamBuffer(receiveBuffer);
            if (finalData) {
              sendLLMStream(finalData);
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: false });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.trim() === '') {
            receiveBuffer = [];
            continue;
          } else {
            lastAvailableChunk = receiveBuffer;
          }

          if (line.startsWith('data:')) {
            receiveBuffer.push(line);
          }
        }

        // 处理当前累积的缓冲区
        const data = this.processStreamBuffer(lastAvailableChunk);
        if (data) {
          sendLLMStream(data);
        }
      }

    } catch (error) {
      console.error('Remote LLM call failed:', error);
      sendSystemLog(`❌ 错误: ${error.message}`);
      throw error;
    }
  }

  // 将 processStreamBuffer 改为类方法
  processStreamBuffer(buffer) {
    if (!buffer || buffer.length === 0) return null;

    return buffer
      .map(line => line.replace('data:', '').trim())
      .join('\n');
  }

  async callLLMRemoteSync(messages) {
    try {
      const serverInfo = await this.globalContext.localServerManager.getCurrentServerInfo();
      if (!serverInfo.isHealthy || !serverInfo.port) {
        throw new Error('本地服务器未启动,请在管理界面中启动本地知识库服务');
      }

      const formattedMessages = messages.map(msg => ({
        role: msg.role || 'user',
        content: msg.content
      }));

      const response = await fetch(`http://localhost:${serverInfo.port}/chat/syncCall`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: formattedMessages
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.text();
      return [result]; // 保持与原有 callSync 返回格式一致
    } catch (error) {
      console.error('Remote LLM sync call failed:', error);
      throw error;
    }
  }

}
