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
                    content: `请根据以下查询生成关键词列表，你觉得越重要的词，放在越前面 ：${query} \n 。示例输出：\n ["关键词1", "关键词2", "关键词3"]`
                }];

                const response = await this.globalContext.llmCaller.callAsync(userPrompts);
                const keywords = JSON.parse(response[0]);
                console.info(`Attempt ${attempt + 1} succeeded. Received JSON result from LLM:`, keywords);

                const keywordLists = [];
                for (let i = keywords.length; i > 0; i--) {
                    const subKeywords = keywords.slice(0, i);
                    keywordLists.push(subKeywords.join(' ')); // 将数组转换为空格分隔的字符串
                }
                console.info("Generated keyword lists:", keywordLists);
                return keywordLists;

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