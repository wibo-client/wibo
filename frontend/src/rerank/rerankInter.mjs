/**
 * 文档重排序接口，提供文档重排序功能
 */
export class DocumentRerankInterface {
    /**
     * 重排序方法
     * 
     * @param {Array} documentPartList 文档片段列表
     * @param {string} queryString 查询字符串
     * @return {Promise<Array>} 重排序后的文档片段列表
     */
    async rerank(documentPartList, queryString) {
        throw new Error('Method not implemented.');
    }
}
