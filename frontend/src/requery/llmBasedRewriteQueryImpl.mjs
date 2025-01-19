import { QueryRewriter } from './rewriteQueryInter.mjs';
import { JsonUtils } from '../utils/jsonUtils.mjs';

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
     * @param {string} originalQuery 用户的查询关键词
     * @return {Promise<Array<string>>} 需要查询的关键词列表，有顺序
     */
    async rewriteQuery(originalQuery) {
        const prompt = `请帮我分析以下用户查询，提取关键信息并按指定格式返回：
        1. 识别查询中的具体时间范围，比如"最近一周"、"过去7天"、"上个月"等，并转换为具体的天数
        2. 识别必须包含的关键词
        3. 识别可选的关键词
        4. 识别精确短语匹配
        5. 只返回要求返回的json信息，禁止返回其他任何分析和说明信息。
        
        请按以下格式返回结果：
        {
        "lastNDays": 数字（如果提到了时间范围，没有则返回-1）, 
        "requiredTerms": ["必需词1", "必需词2"],
        "optionalTerms": ["可选词1", "可选词2"],
        "exactPhrases": ["精确短语1", "精确短语2"]
        }

        用户查询：${originalQuery}`;

        try {
            const response = await this.globalContext.llmCaller.callAsync(
                [{ role: 'user', content: prompt }],
                false
            );

            const jsonString = JsonUtils.extractJsonFromResponse(response[0]);
            if (!jsonString) {
                throw new Error('无法提取有效的JSON');
            }

            let parsed;
            try {
                parsed = JSON.parse(jsonString);
            } catch (e) {
                console.error('解析LLM响应失败:', e);
                parsed = {
                    lastNDays: 0,
                    requiredTerms: [],
                    optionalTerms: [],
                    exactPhrases: []
                };
            }

            // 时间范围规范化处理
            const lastNDays = parseInt(parsed.lastNDays) || 0;

            return [{
                query: this.constructSearchQuery(
                    parsed.requiredTerms || [],
                    parsed.optionalTerms || [],
                    parsed.exactPhrases || [],
                    lastNDays,
                    originalQuery
                ),
                queryLog: `查询重写：
                • 必需词：${(parsed.requiredTerms || []).join(', ')}
                • 可选词：${(parsed.optionalTerms || []).join(', ')}
                • 精确短语：${(parsed.exactPhrases || []).join(', ')}
                • 时间范围：${lastNDays > 0 ? `最近${lastNDays}天` : '未指定'}
        `
            }];
        } catch (error) {
            console.error('查询重写失败:', error);
            return [{
                query: { lastNDays: 0, originalQuery: originalQuery },
                queryLog: '查询重写失败，使用原始查询'
            }];
        }
    }

    constructSearchQuery(requiredTerms, optionalTerms, exactPhrases, lastNDays , originalQuery) {
        return {
            requiredTerms,
            optionalTerms,
            exactPhrases,
            lastNDays,
            originalQuery
        };
    }
}

export default LLMBasedQueryRewriter;