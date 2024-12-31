import { DocumentRerankInterface } from './rerankInter.mjs';


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
        let index = 0 ; 
        for(const part of documentPartList) {
            part.id = String( index++);
        }
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
            ["2", "3","1"]`
        }];

        let attempts = 0;
        let jsonResult = null;

        while (attempts < 3) {
            try {
                const response = await this.llmCall.callAsync(messages);
                jsonResult = response[0];
                console.info("Received JSON result from LLM:", jsonResult);

                try {
                    const jsonArray = jsonResult.match(/```json\s*(\[.*?\])\s*```/s);
                    const orderedDocIds = jsonArray ? JSON.parse(jsonArray[1]) : JSON.parse(jsonResult);

                    if (Array.isArray(orderedDocIds)) {
                        const documentPartMap = new Map(documentPartList.map((part, index) => [String(index), part]));
                        const reorderedDocumentParts = orderedDocIds.map(id => documentPartMap.get(String(id))).filter(Boolean);

                        console.info("Rerank process completed. Reordered document parts:", JSON.stringify(reorderedDocumentParts));
                        return reorderedDocumentParts;
                    } else {
                        throw new Error("Invalid JSON format");
                    }
                } catch (jsonError) {
                    console.error("Failed to parse JSON response or invalid format:", jsonError);
                    attempts++;
                    if (attempts >= 3) {
                        throw new Error("Failed to rerank documents after 3 attempts");
                    }
                }
            } catch (apiError) {
                console.error("API call failed:", apiError);
                attempts++;
                if (attempts >= 3) {
                    throw new Error("Failed to rerank documents after 3 attempts");
                }
            }
        }
    }
}

export default LLMBasedRerankImpl;