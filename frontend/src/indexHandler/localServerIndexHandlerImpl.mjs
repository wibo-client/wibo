import { IndexHandlerInterface } from './indexHandlerInter.mjs';


export class LocalServerIndexHandlerImpl extends IndexHandlerInterface {
    constructor() {
        super();
        this.BASE_URL = null;
    }

    async init(globalContext, handlerConfig) {
        this.globalContext = globalContext;
    }

    getHandlerName() {
        return 'LocalServerIndexHandlerImpl';
    }

    getInterfaceDescription() {
        return '本地搜索服务';
    }

    async search(queryStr, pathPrefix = '') {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            const configHandler = this.globalContext.configHandler;
            const searchItemNumbers = await configHandler.getSearchItemNumbers();

            const response = await fetch(`${this.BASE_URL}/search?queryStr=${encodeURIComponent(queryStr)}&pathPrefix=${encodeURIComponent(pathPrefix)}&TopN=${searchItemNumbers}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const results = await response.json();
            return results;
        } catch (error) {
            console.error('Search failed:', error);
            throw error;
        }
    }

    async fetchAggregatedContent(summaryList) {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            const configHandler = this.globalContext.configHandler;
            const pageFetchLimit = await configHandler.getPageFetchLimit();

            const limitedSummaryList = summaryList.slice(0, pageFetchLimit);
            const response = await fetch(`${this.BASE_URL}/fetchAggregatedContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ summaryList: limitedSummaryList }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Fetch aggregated content failed:', error);
            throw error;
        }
    }

    async getAllPossiblePath() {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            const response = await fetch(`${this.BASE_URL}/getAllPaths`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Get all paths failed:', error);
            throw error;
        }
    }

    async rewriteQuery(query) {
        // 本地服务器不需要重写查询
        return [query];
    }

    async rerank(documentPartList, queryString) {
        // 本地服务器不需要重新排序
        return documentPartList;
    }
}

export default LocalServerIndexHandlerImpl;
