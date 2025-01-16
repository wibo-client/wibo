import LLMCall from '../llmCaller/LLMCall.mjs';
import { QueryRewriter } from './rewriteQueryInter.mjs';

export class LLMBasedQueryRewriter extends QueryRewriter {
    constructor() {
        super();
    }

    async init(globalContext) {
        this.globalContext = globalContext;

    }

    /**
     * 重新生成查询关键词的方法
     * 
     * @param {string} query 用户的查询关键词
     * @return {Promise<Array<string>>} 需要查询的关键词列表，有顺序
     */
    async rewriteQuery(query) {
        const MAX_RETRIES = 3;
        let attempt = 0;
        let lastError = null;

        while (attempt < MAX_RETRIES) {
            try {
                const userPrompts = [{
                    role: 'user',
                    content: `您是一个搜索专家。请将用户的问题分解为以下三个部分：
                                1. 精确匹配短语：需要完全匹配的词组（用引号括起来）
                                2. 必需关键词：必须出现在结果中的单词（用加号标记）
                                3. 可选关键词：可以出现在结果中的相关词（普通列表）

                                输出格式：
                                {
                                    "exact_phrases": ["完整短语1", "完整短语2"],
                                    "required_terms": ["必需词1", "必需词2"],
                                    "optional_terms": ["可选词1", "可选词2"]
                                }

                                用户问题：${query}`
                }];

                const response = await this.globalContext.llmCaller.callAsync(userPrompts);
                const parsedResponse = JSON.parse(response[0]);
                console.info(`Attempt ${attempt + 1} succeeded. Received JSON result from LLM:`, parsedResponse);

                return {
                    exactPhrases: parsedResponse.exact_phrases,
                    requiredTerms: parsedResponse.required_terms,
                    optionalTerms: parsedResponse.optional_terms
                };

            } catch (error) {
                lastError = error;
                attempt++;
                console.warn(`Attempt ${attempt} failed. Error:`, error.message);

                if (attempt < MAX_RETRIES) {
                    // 等待一段时间后重试，使用指数退避
                    const delay = Math.pow(2, attempt) * 1000; // 2秒, 4秒, 8秒
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        console.error("All retry attempts failed:", lastError);
        throw new Error("Failed to rewrite query after multiple attempts");
    }
}

export default LLMBasedQueryRewriter;