import { DocumentRerankInterface } from './rerankInter.mjs';
import { JsonUtils } from '../utils/jsonUtils.mjs';

export class LLMBasedRerankImpl extends DocumentRerankInterface {
    constructor(isDebugModel = false) {
        super();
        this.isDebugModel = isDebugModel;
    }

    async init(globalContext) {
        this.llmCall = globalContext.llmCaller;
    }

    async rerank(documentPartList, queryString) {
        console.debug("Starting rerank process for query:", queryString);
        console.debug("Document part list:", JSON.stringify(documentPartList));

        const params = {
            userInput: queryString,
            documents: JSON.stringify(documentPartList),
            DebugModel: this.isDebugModel ? ",并且输出理由。" : ",只输出结果，不要输出理由。"
        };

        const messages = [{
            role: 'user',
            content: `已知用户的需求：\n
            ${queryString}\n
            目前有如下一组可能跟相关的文档：\n
            ${JSON.stringify(documentPartList)}\n
            要求：根据用户输入的需求，依照文档里面的highLightContentPart 中，最有可能解决用户需求的顺序排列，重新对这些文档进行排序，并只输出文档的 ID，格式为 JSON。 ${params.DebugModel}\n
            示例输出：\n
            ["2","3","1","4","5"]`
        }];

        let attempts = 0;
        while (attempts < 3) {
            try {
                const response = await this.llmCall.callAsync(messages);
                console.info("Received JSON result from LLM:", response[0]);

                const jsonString = JsonUtils.extractJsonFromResponse(response[0]);
                if (!jsonString) {
                    throw new Error("无法提取有效的JSON");
                }

                const orderedDocIds = JSON.parse(jsonString);
                if (Array.isArray(orderedDocIds)) {
                    const documentPartMap = new Map(documentPartList.map((part, index) => [String(part.id), part]));
                    const reorderedDocumentParts = orderedDocIds
                        .map(id => documentPartMap.get(String(id)))
                        .filter(Boolean);

                    console.info("Rerank process completed. Reordered document parts:", JSON.stringify(reorderedDocumentParts));
                    return reorderedDocumentParts;
                } else {
                    throw new Error("返回的JSON不是数组格式");
                }
            } catch (error) {
                console.error(`Attempt ${attempts + 1} failed:`, error);
                attempts++;
                if (attempts >= 3) {
                    console.error("All rerank attempts failed");
                    return documentPartList; // 失败时返回原始列表
                }
            }
        }

        return documentPartList;
    }
}

export default LLMBasedRerankImpl;