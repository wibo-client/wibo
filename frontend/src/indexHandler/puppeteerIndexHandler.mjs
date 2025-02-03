import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import { JsonUtils } from '../utils/jsonUtils.mjs';

export class PuppeteerIndexHandler extends IndexHandlerInterface {
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


    async collectFacts(message, path, requestContext) {
        requestContext.checkAborted();
        await requestContext.selectedPlugin.searchAndRerank(message, path, requestContext);
        requestContext.checkAborted();
        const searchResults = requestContext.results.searchResults;
        requestContext.sendSystemLog(`🔍 开始获取详细的网页内容以供分析`);
        const detailsSearchResults = await this.fetchAggregatedContent(searchResults);
        requestContext.results.detailsSearchResults = detailsSearchResults;
        requestContext.sendSystemLog(`✅ 获取到 ${detailsSearchResults.length} 条详细内容`);
        requestContext.checkAborted();
        await this.extractKeyFacts(message, path, requestContext);

    }


    async fetchAggregatedContent(summaryList) {
        return await this.contentAggregator.aggregateContent(summaryList);
    }



    async extractKeyFacts(message, path, requestContext) {
        const detailsSearchResults = requestContext.results.detailsSearchResults;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                requestContext.checkAborted();  // 添加检查
                // 检查聚合内容是否为空
                if (!detailsSearchResults || detailsSearchResults.length === 0) {
                    requestContext.sendSystemLog('ℹ️ 无法获取详细内容');
                    requestContext.results.parsedFacts = [];
                    return;
                }

                let currentLength = 0;
                let partIndex = 1;
                const tasks = [];
                const maxConcurrentTasks = 2;
                const groupAnswers = [];
                const todoTasksRef = [];

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

                let taskBatchIndex = 0;
                for (const doc of detailsSearchResults) {
                    const jsonReference = createJsonReference(doc);

                    let jsonStr = JSON.stringify(jsonReference, null, 2);
                    if (currentLength + jsonStr.length < this.MAX_CONTENT_SIZE) {
                        todoTasksRef.push(jsonReference);
                        currentLength += jsonStr.length;
                        continue;
                    } else {
                        const currentBatchIndex = ++taskBatchIndex; // 在这里获取独立的批次号
                        const currentBatchRefs = [...todoTasksRef];

                        const jsonPrompt = createJsonPrompt(currentBatchRefs, message);
                        tasks.push(async () => {
                            requestContext.sendSystemLog(`🤖 分析内容(本步骤较慢) ,批次 ${currentBatchIndex}，分析 ${currentBatchRefs.length} 条内容`);
                            let groupAnswer;
                            for (let i = 0; i < 3; i++) {
                                try {
                                    groupAnswer = await this.globalContext.llmCaller.callSync([{
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
                                requestContext.sendSystemLog(`✅ 批次 ${currentBatchIndex}内容分析完成`);
                            } else {
                                requestContext.sendSystemLog('❌ 内容分析失败');
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
                    const currentBatchIndex = ++taskBatchIndex; // 在这里获取独立的批次号
                    // 创建最后一批的副本
                    const finalBatchRefs = [...todoTasksRef];
                    const jsonPrompt = createJsonPrompt(finalBatchRefs, message);

                    tasks.push(async () => {
                        requestContext.sendSystemLog(`🤖 分析内容（本步骤较慢）,批次 ${currentBatchIndex}，分析 ${finalBatchRefs.length} 条内容，剩余 0 条待分析`);
                        let groupAnswer;
                        for (let i = 0; i < 3; i++) {
                            try {
                                requestContext.checkAborted();  // 添加检查
                                groupAnswer = await this.globalContext.llmCaller.callSync([{
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
                            requestContext.sendSystemLog('✅ 最后的一个批次，内容分析完成');
                        } else {
                            requestContext.sendSystemLog('❌ 内容分析失败,一般是因为模型返回不符合预期');
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
                    requestContext.sendSystemLog(resultMessage);
                    requestContext.results.parsedFacts = parsedFacts;
                    return;
                }

                // 如果没有有效响应，但还有重试机会
                if (attempt < 2) {
                    throw new Error('未获得有效响应，准备重试');
                }

                // 最后一次尝试也失败了，返回空数组
                requestContext.sendSystemLog('ℹ️ 未能获取有效内容');
                requestContext.results.parsedFacts = [];
                return;

            } catch (error) {
                console.error(`第 ${attempt + 1} 次尝试失败:`, error.message);
                requestContext.sendSystemLog(`⚠️ 第 ${attempt + 1} 次尝试失败，${attempt < 2 ? '正在重试...' : ''}`);

                if (attempt === 2) {
                    requestContext.results.parsedFacts = [];
                    return;
                }
            }
        }
    }
}

export default PuppeteerIndexHandler;