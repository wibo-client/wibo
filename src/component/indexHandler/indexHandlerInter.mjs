/**
 * 索引处理接口，提供索引构建和搜索功能
 */
export class IndexHandlerInterface {

    async loadConfig(config) {
        throw new Error('Method not implemented.');
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
    
    async getPossiblePath(path) {
        throw new Error('Method not implemented.');
    }

    
    async rerank(documentPartList, queryString) {
        throw new Error('Method not implemented.');
    }
    /**
     * 基础搜索方法，使用默认的搜索结果数量限制
     * 
     * @param {string} query 搜索关键词
     * @return {Promise<Array>} 文档片段列表
     */
    async search(query) {
        throw new Error('Method not implemented.');
    }

    /**
     * 带结果数量限制的搜索方法
     * 
     * @param {string} query 搜索关键词
     * @param {number} TopN 返回结果的最大数量
     * @return {Promise<Array>} 文档片段列表
     */
    async search(query, TopN) {
        throw new Error('Method not implemented.');
    }

    /**
     * 支持用户筛选和路径前缀的搜索方法
     * 
     * @param {string} queryStr 搜索关键词
     * @param {string} pathPrefix 文件路径前缀，用于筛选特定目录下的文档
     * @return {Promise<Array>} 文档片段列表
     */
    async search(queryStr, pathPrefix) {
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
}
