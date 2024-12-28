import LLMCall from '../llmCaller/LLMCall.mjs';
import { QueryRewriter } from './rewriteQueryInter.mjs';

export class LLMBasedQueryRewriter extends QueryRewriter {
    constructor(apiKey) {
        this.llmCaller = new LLMCall(apiKey);
    }

    /**
     * 重新生成查询关键词的方法
     * 
     * @param {string} query 用户的查询关键词
     * @return {Promise<Array<string>>} 需要查询的关键词列表，有顺序
     */
    async rewriteQuery(query) {
        const userPrompts = [{
            role: 'user',
            content: `请根据以下查询生成关键词列表：${query}`
        }];

        try {
            const response = await this.llmCaller.callAsync(userPrompts);
            const keywords = JSON.parse(response[0]);
            return keywords;
        } catch (error) {
            console.error("Failed to rewrite query:", error);
            throw new Error("Failed to rewrite query");
        }
    }
}
