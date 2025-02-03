/**
 * 索引处理接口，提供索引构建和搜索功能
 */
export class IndexHandlerInterface {
    constructor() {
        this.MAX_CONTENT_SIZE = 28720;
    }

    async init(globalContext, config) {
        this.globalContext = globalContext;
        // 如果配置中有指定maxContentSize，则覆盖默认值
        if (config?.maxContentSize) {
            this.MAX_CONTENT_SIZE = config.maxContentSize;
        }
    }

    getInterfaceDescription() {
        throw new Error('Method not implemented.');
    }

    getHandlerName() {
        throw new Error('Method not implemented.');
    }

    async rewriteQuery(query) {
        return [query];
    }

    // 删除 getPossiblePath 方法
    // async getPossiblePath(path) {
    //     throw new Error('Method not implemented.');
    // }

    async rerank(documentPartList, queryString) {
        throw new Error('Method not implemented.');
    }

    async fetchAggregatedContent(summaryList) {
        throw new Error('Method not implemented.');
    }

    /**
     * 获取所有可能的路径
     * @returns {Promise<string[]>} 返回所有可能的路径列表
     */
    async getAllPossiblePath() {
        throw new Error('Method not implemented.');
    }






    /**
     * 完整的搜索方法，支持所有搜索参数
     * 
     * @param {string} queryStr 搜索关键词
     * @param {string} pathPrefix 文件路径前缀，用于筛选特定目录下的文档
     * @param {number} TopN 返回结果的最大数量
     * @return {Promise<Array>} 文档片段列表
     */
    async search(queryStr, pathPrefix, TopN) {
        throw new Error('Method not implemented.');
    }


    async searchAndRerank(message, path, requestContext) {
        const requestType = requestContext.type;
        const searchItemNumbers = await this.globalContext.configHandler.getSearchItemNumbers();
        const pageFetchLimit = await this.globalContext.configHandler.getPageFetchLimit();
        let searchResults = [];

        // 根据请求类型设置限制值
        const limitThisTurn = requestType === 'searchAndChat' ? pageFetchLimit : searchItemNumbers;

        requestContext.sendSystemLog('🔄 开始重写查询...');
        const requeryResult = await requestContext.selectedPlugin.rewriteQuery(message);
        requestContext.sendSystemLog(`✅ 查询重写完成，生成 ${requeryResult.length} 个查询`);

        for (const query of requeryResult) {
            if (searchResults.length >= limitThisTurn) {
                requestContext.sendSystemLog(`📊 已达到搜索结果数量限制: ${limitThisTurn}`);
                break;
            }

            requestContext.sendSystemLog(query.queryLog);
            requestContext.checkAborted();
            const result = await requestContext.selectedPlugin.search(query.query, path);
            requestContext.checkAborted();

            // 直接添加所有结果，不做去重
            searchResults = searchResults.concat(result);
            if (searchResults.length >= limitThisTurn) {
                searchResults = searchResults.slice(0, limitThisTurn);
                break;
            }
        }

        // rerank 移到循环外部，只在 searchAndChat 模式下执行
        if (requestType === 'searchAndChat') {
            requestContext.checkAborted();
            searchResults = await this.globalContext.rerankImpl.rerank(searchResults, message);
        }

        requestContext.sendSystemLog(`✅ 搜索完成，获取到 ${searchResults.length} 个结果`);
        requestContext.results.searchResults = searchResults;
    }


    async buildSearchResultsString(message, path, requestContext) {
        const searchResults = requestContext.results.searchResults;
        let sb = '';
        let fileNumber = 1;
        searchResults.forEach(result => {
            sb += `#### index ${fileNumber++} 标题 ： [${result.title}](${result.url})\n\n`;

            sb += `${result.description}\n`;
            if (result.date) {
                sb += `${result.date}\n`;
            }
        });

        requestContext.results.markdownResult = sb;
    }


    async buildPromptFromContent(message, path, requestContext) {
        const aggregatedContent = requestContext.results.detailsSearchResults;
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
        requestContext.results.finalPrompt = `尽可能依托于如下参考信息：\n${suggestionContext}\n\n处理用户的请求：\n${message}`;
    }


    buildReferenceData(message, path, requestContext) {
        const aggregatedContent = requestContext.results.searchResults || [];
        const referenceData = {
            fullContent: aggregatedContent.map((doc, index) => ({
                index: index + 1,
                title: doc.title || '',
                url: doc.realUrl || '',
                date: doc.date || '',
                description: (doc.description || doc.summary || '')
                    .replace(/<\/?h[1-6][^>]*>/gi, "") // 去掉所有的 <h1> 到 <h6> 标签
                    .replace(/\n/g, " ") // 去掉所有的换行符
                    .replace(/<br\s*\/?>/gi, " ") // 去掉所有的 <br> 标签
                    .replace(/^#{1,6}\s+/gm, "") // 去掉所有的 # ## ### ....#####
            })),
            totalCount: aggregatedContent.length
        };

        requestContext.results.referenceData = referenceData;
    }


    async fetchDetailsWithLimit(message, path, requestContext) {
        const searchResults = requestContext.results.searchResults;

        requestContext.sendSystemLog('📑 获取详细内容...');
        if (!searchResults || searchResults.length === 0) {
            requestContext.sendSystemLog('ℹ️ 未找到相关内容');
            requestContext.results.detailsSearchResults = [];
            return;
        }

        // 获取配置的限制数量
        const pageFetchLimit = await this.globalContext.configHandler.getPageFetchLimit();
        
        // 限制处理数量
        const limitedResults = searchResults.slice(0, pageFetchLimit);
        requestContext.sendSystemLog(`🔍 将处理前 ${pageFetchLimit} 条搜索结果`);

        const detailsSearchResults = await requestContext.selectedPlugin.fetchAggregatedContent(limitedResults);
        requestContext.sendSystemLog(`✅ 获取到 ${detailsSearchResults.length} 个详细内容，开始回答问题，你可以通过调整 [单次查询详情页抓取数量] 来调整依托多少内容来回答问题`);

        requestContext.results.detailsSearchResults = detailsSearchResults;
    }


    async refineBatch(currentBatch, message, requestContext, roundIndex, batchIndex) {
        const batchContent = currentBatch.join('\n\n--- 分割线 ---\n\n');
        const prompt = `请基于以下内容进行精炼，保留所有重要信息，包含事实，代码，链接，观点等关键信息，消除重复内容，保持逻辑连贯。要求：1. 保留所有重要信息 2. 消除重复内容 3. 保持逻辑连贯\n\n 参考内容： \n ${batchContent}\n\n请基于以上内容，精炼出所有有助于回答问题的有效信息：${message}`;

        requestContext.sendSystemLog(`🔄 第 ${roundIndex} 轮精炼，第 ${batchIndex} 个批次开始处理...`);
        let refinedAnswer;
        for (let j = 0; j < 3; j++) {
            try {
                requestContext.checkAborted();  // 添加检查
                refinedAnswer = await this.globalContext.llmCaller.callSync([{ role: 'user', content: prompt }]);
                break;
            } catch (error) {
                console.error(`Error in LLM call attempt ${j + 1}:`, error);
            }
        }

        if (refinedAnswer) {
            requestContext.sendSystemLog(`✅ 第 ${roundIndex} 轮精炼，第 ${batchIndex} 个批次处理完成`);
            // 确保返回数组形式
            const result = refinedAnswer.join('').split('\n\n--- 分割线 ---\n\n');
            return Array.isArray(result) ? result : [result];
        } else {
            requestContext.sendSystemLog('❌ 内容精炼失败');
            return null;
        }
    }

    // 输入： requestContext.results.parsedFacts;
    async refineParsedFacts(message, path, requestContext) {
        const searchResults = requestContext.results.parsedFacts;

        // 添加空结果检查
        if (!searchResults || searchResults.length === 0) {
            requestContext.sendSystemLog('ℹ️ 没有找到相关内容可供精炼');
            requestContext.results.refinedFacts = {
                fact: '',
                urls: []
            };
            return;
        }

        requestContext.sendSystemLog(' 🔄 开始精炼数据......');

        // 1. 提取所有 URL
        const allUrls = Array.from(new Set(
            searchResults.map(result => result.url)
        ));

        // 2. 检查是否需要精炼
        const factsContent = searchResults.map(result => result.fact || result.summary || '');
        const totalLength = factsContent.join('').length;

        if (totalLength <= this.MAX_CONTENT_SIZE) {
            // 如果内容长度已经符合要求，直接返回
            requestContext.sendSystemLog('✅ 精炼完毕，开始基于精炼后内容回答问题 ');
            requestContext.results.refinedFacts = {
                fact: factsContent.join('\n\n'),
                urls: allUrls
            };
            requestContext.sendSystemLog('如果您需要，可设该问题为常问问题，可以加快类似问题的回答速度。 ');

            return;
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
            let batchIndex = 1;
            for (const content of refinedContent) {
                if (currentBatch.join(' ').length + content.length <= this.MAX_CONTENT_SIZE) {
                    currentBatch.push(content);
                } else {
                    const refinedBatch = await this.refineBatch(currentBatch, message, requestContext, i + 1, batchIndex++);
                    if (refinedBatch === null) {
                        break;
                    }
                    newRefinedContent = newRefinedContent.concat(refinedBatch);
                    currentBatch = [content];
                }
            }

            // 处理剩余的批次
            if (currentBatch.length > 0) {
                const refinedBatch = await this.refineBatch(currentBatch, message, requestContext, i + 1, batchIndex++);
                if (refinedBatch !== null) {
                    newRefinedContent = newRefinedContent.concat(refinedBatch);
                }
            }

            refinedContent = newRefinedContent;
        }

        // 4. 返回精炼后的结果
        requestContext.results.refinedFacts = {
            fact: refinedContent.join('\n\n'),
            urls: allUrls
        };
    }


    // 输出： requestContext.results.refinedFacts;  和 requestContext.results.searchResults ，都要有。后面都有用
    async collectFacts(message, path, requestContext) {
        throw new Error('Method not implemented.');
    }

}
