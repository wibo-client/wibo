import LLMCall from '../llmCaller/LLMCall.mjs';
import { QueryRewriter } from './rewriteQueryInter.mjs';

export class LLMBasedQueryRewriter extends QueryRewriter {
    constructor() {
        super();
    }

    async init(llmCaller) {
        this.llmCaller = llmCaller;
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
            content: `请根据以下查询生成关键词列表，你觉得越重要的词，放在越前面 ：${query} \n 示例输出：\n ["关键词1", "关键词2", "关键词3"]`
        }];

        try {
            const response = await this.llmCaller.callAsync(userPrompts);
            const keywords = JSON.parse(response[0]);
            console.info("Received JSON result from LLM:", keywords);

            const keywordLists = [];
            for (let i = keywords.length; i > 0; i--) {
                keywordLists.push(keywords.slice(0, i));
            }

            return keywordLists;
        } catch (error) {
            console.error("Failed to rewrite query:", error);
            throw new Error("Failed to rewrite query");
        }
    }
}

export default LLMBasedQueryRewriter;