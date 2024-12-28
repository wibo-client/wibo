import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import { LLMBasedRerankImpl } from '../rerank/llmbasedRerankImpl.mjs';

export class PuppeteerIndexHandler extends IndexHandlerInterface {
    constructor(handlerConfig) {
        super();
        this.handlerConfig = handlerConfig;
        this.rerankImpl = new LLMBasedRerankImpl(/* isDebugModel */);
    }
    /**
     * 
     */
    
    async rewriteQuery(query) {
        return [query];
    }

    async getPossiblePath(path) {
        const pathPrefix = this.handlerConfig.pathPrefix;
        if (!pathPrefix.endsWith('/')) {
            throw new Error("Path prefix should end with /");
        }

        const possiblePaths = [];
        if (path.length < pathPrefix.length) {
            const relativePath = pathPrefix.substring(path.length);
            if (relativePath) {
                const nextSlashIndex = relativePath.indexOf('/');
                if (nextSlashIndex !== -1) {
                    possiblePaths.push(relativePath.substring(0, nextSlashIndex + 1));
                } else {
                    possiblePaths.push(relativePath);
                }
            }
        }

        return possiblePaths;
    }

    getInterfaceDescription() {
        throw new Error('Method not implemented.');
    }

    async rerank(documentPartList, queryString) {
        if (!Array.isArray(documentPartList) || typeof queryString !== 'string') {
            throw new TypeError('Invalid input types for rerank method');
        }
        return await this.rerankImpl.rerank(documentPartList, queryString);
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
