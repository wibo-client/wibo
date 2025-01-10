import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import LocalServerManager from '../server/LocalServerManager.mjs';

export class LocalServerIndexHandlerImpl extends IndexHandlerInterface {
    constructor() {
        super();
        this.BASE_URL = null;
        this.serverManager = null;
    }

    async init(globalContext, handlerConfig) {
        this.globalContext = globalContext;
        this.serverManager = new LocalServerManager();

        // 监听服务器状态更新
        if (process.send) {
            process.on('message', (message) => {
                if (message.type === 'serverStateUpdate') {
                    this.updateBaseUrl(message.data);
                }
            });
        }

        // 初始获取服务器信息
        const serverInfo = await this.serverManager.getCurrentServerInfo();
        this.updateBaseUrl(serverInfo);
    }

    updateBaseUrl(serverInfo) {
        if (serverInfo.isHealthy && serverInfo.port) {
            this.BASE_URL = `http://localhost:${serverInfo.port}`;
            console.log('[LocalServerIndexHandler] Base URL updated:', this.BASE_URL);
        } else {
            this.BASE_URL = null;
            console.log('[LocalServerIndexHandler] Server is not available');
        }
    }

    async search(queryStr, pathPrefix = '') {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            const configHandler = this.globalContext.configHandler;
            const searchItemNumbers = await configHandler.getSearchItemNumbers();
            if (pathPrefix.startsWith('/local/')) {
                pathPrefix = pathPrefix.substring(7);
            }

            // 处理 Windows 样式路径
            if (pathPrefix.includes(':')) {
                pathPrefix = pathPrefix.replace(/\//g, '\\');
            }

            const response = await fetch(`${this.BASE_URL}/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    queryStr,
                    pathPrefix,
                    TopN: searchItemNumbers
                }),
            });

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
            const paths = await response.json();
            // 为每个路径添加 "/local/" 前缀
            return paths.map(path => `/local${path}`);
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

    getHandlerName() {
        return 'LocalServerIndexHandlerImpl';
    }

    getInterfaceDescription() {
        return '本地搜索服务';
    }
}

export default LocalServerIndexHandlerImpl;
