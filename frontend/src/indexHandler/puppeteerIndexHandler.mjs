import { AbstractIndexHandler } from './abstractIndexHandler.mjs';
import { JsonUtils } from '../utils/jsonUtils.mjs';
import logger from '../utils/loggerUtils.mjs';

export class PuppeteerIndexHandler extends AbstractIndexHandler {
    constructor() {
        super();
    }

    async init(globalContext, handlerConfig) {
        await super.init(globalContext, handlerConfig);
        this.globalContext = globalContext;
        this.handlerConfig = handlerConfig;
        this.rerankImpl = globalContext.rerankImpl;
        this.contentAggregator = globalContext.contentAggregator;
    }

    /**
     * 
     */

    async rewriteQuery(query) {
        return [query];
    }

    getInterfaceDescription() {
        throw new Error('Method not implemented.');
    }

    async rerank(documentPartList, queryString) {
        if (!Array.isArray(documentPartList) || typeof queryString !== 'string') {
            throw new TypeError('Invalid input types for rerank method');
        }
        return await this.rerankImpl.rerank(documentPartList, queryString);
    }

    getHandlerName() {
        return 'PuppeteerIndexHandler';
    }


    async deepSearch_collectFacts(message, path, requestContext) {
        requestContext.checkAborted();
        await requestContext.selectedPlugin.deepSearch_searchAndRerank(message, path, requestContext);
        requestContext.checkAborted();
        const searchResults = requestContext.results.searchResults;
        requestContext.sendSystemLog(`🔍 开始获取详细的网页内容以供分析`);
        const detailsSearchResults = await this.fetchAggregatedContent(searchResults, requestContext);
        requestContext.results.detailsSearchResults = detailsSearchResults;
        requestContext.sendSystemLog(`✅ 获取到 ${detailsSearchResults.length} 条详细内容`);
        requestContext.checkAborted();
        await this.extractKeyFacts(message, path, requestContext);

    }


    async fetchAggregatedContent(summaryList, requestContext) {
        let successCount = 0;
        const results = await Promise.all(
            summaryList.map(async (summary, index) => {
                try {
                    const result = await this.contentAggregator.aggregateContent([summary]);
                    if (result && result.length > 0) {
                        successCount++;
                        // 每5个成功输出一次反馈
                        if (successCount % 5 === 0) {
                            requestContext.sendSystemLog(`✅ 已成功获取 ${successCount} 个网页内容`);
                        }
                        return result[0];
                    } else {
                        return null;
                    }
                } catch (error) {
                    return null;
                }
            })
        );

        const validResults = results.filter(Boolean);
        requestContext.sendSystemLog(`📊 总计: 成功获取 ${validResults.length} 个网页内容，失败 ${summaryList.length - validResults.length} 个`);

        return validResults;
    }



    async extractKeyFacts(message, path, requestContext) {
        logger.debug('开始提取关键事实');
        const detailsSearchResults = requestContext.results.detailsSearchResults;
        logger.debug(`detailsSearchResults: ${detailsSearchResults[0].content}`);
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                requestContext.checkAborted();
                if (!detailsSearchResults || detailsSearchResults.length === 0) {
                    requestContext.sendSystemLog('ℹ️ 无法获取详细内容');
                    requestContext.results.parsedFacts = [];
                    return;
                }

                let currentLength = 0;
                let partIndex = 1;
                const referenceGroups = [];
                let currentGroup = [];

                const createJsonPrompt = (jsonReference, message) => {
                    const prompt = `请基于 参考信息 references 里 content 字段里的内容，提取有助于回答问题的关键事实，
            
            要求：
            1. 回答中尽可能使用原文内容，包含详细数据和 URL 地址等，不要漏掉数据和连接。
            2. 额外澄清依据的文件路径（即 reference里 url字段）。
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
            4. 如参考信息 references 不足以回答问题,返回空的Answer json对象,格式如下：
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

                // 将文档分组
                for (const doc of detailsSearchResults) {
                    const jsonReference = createJsonReference(doc);
                    let jsonStr = JSON.stringify(jsonReference, null, 2);

                    if (currentLength + jsonStr.length < this.MAX_CONTENT_SIZE) {
                        currentGroup.push(jsonReference);
                        currentLength += jsonStr.length;
                    } else {
                        referenceGroups.push([...currentGroup]);
                        currentGroup = [jsonReference];
                        currentLength = jsonStr.length;
                    }
                }
                if (currentGroup.length > 0) {
                    referenceGroups.push(currentGroup);
                }

                // 并行处理所有组
                const processGroup = async (refs, batchIndex) => {
                    requestContext.sendSystemLog(`🤖 开始分析内容批次 ${batchIndex}，包含 ${refs.length} 条内容`);
                    const jsonPrompt = createJsonPrompt(refs, message);

                    for (let i = 0; i < 3; i++) {
                        try {
                            requestContext.checkAborted();
                            const groupAnswer = await this.globalContext.llmCaller.callSync([{
                                role: 'user',
                                content: JSON.stringify(jsonPrompt, null, 2)
                            }]);
                            requestContext.sendSystemLog(`✅ 批次 ${batchIndex} 内容分析完成`);
                            return groupAnswer.join('');
                        } catch (error) {
                            if (i < 2) {
                                requestContext.sendSystemLog(`⚠️ 批次 ${batchIndex} 第 ${i + 1} 次尝试失败，正在重试...`);
                            }
                        }
                    }
                    throw new Error(`批次 ${batchIndex} 处理失败`);
                };

                const groupAnswers = await Promise.all(
                    referenceGroups.map((group, index) => processGroup(group, index + 1))
                );

                const parsedFacts = [];
                let hasValidResponse = false;

                for (const answer of groupAnswers) {
                    try {
                        const jsonString = JsonUtils.extractJsonFromResponse(answer);
                        if (!jsonString) continue;

                        const jsonResponse = JSON.parse(jsonString);
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
                        }
                    } catch (error) {
                        console.error('JSON解析错误:', error.message);
                        continue;
                    }
                }

                if (hasValidResponse) {
                    const resultMessage = parsedFacts.length > 0
                        ? `✅ 成功解析 ${parsedFacts.length} 条事实`
                        : '✅ 未发现相关事实';
                    requestContext.sendSystemLog(resultMessage);
                    requestContext.results.parsedFacts = parsedFacts;
                    return;
                }

                if (attempt < 2) {
                    throw new Error('未获得有效响应，准备重试');
                }

                requestContext.sendSystemLog('ℹ️ 未能获取有效内容');
                requestContext.results.parsedFacts = [];
                return;

            } catch (error) {
                console.error(`第 ${attempt + 1} 次尝试失败: `, error.message);
                requestContext.sendSystemLog(`⚠️ 第 ${attempt + 1} 次尝试失败，${attempt < 2 ? '正在重试...' : ''} `);

                if (attempt === 2) {
                    requestContext.results.parsedFacts = [];
                    return;
                }
            }
        }
    }
}

export default PuppeteerIndexHandler;