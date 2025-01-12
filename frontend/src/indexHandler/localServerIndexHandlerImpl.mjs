import { IndexHandlerInterface } from './indexHandlerInter.mjs';

export class LocalServerIndexHandlerImpl extends IndexHandlerInterface {
    constructor() {
        super();
        this.BASE_URL = null;
    }

    async init(globalContext, handlerConfig) {
        this.globalContext = globalContext;

        const localServerManager = globalContext.localServerManager;
        // 初始获取服务器信息
        const serverInfo = await localServerManager.getCurrentServerInfo();
        this.updateBaseUrl(serverInfo);

        // 每隔5秒获取一次服务器信息并更新 BASE_URL
        setInterval(async () => {
            const serverInfo = await localServerManager.getCurrentServerInfo();
            this.updateBaseUrl(serverInfo);
        }, 5000);
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
            //处理路径问题，如果是windows，大概结构是 /local/C:/Users/xxx/xxx 这样,要处理成C:/Users/xxx/xxx ， mac/linux 是 /local/Users/xxx/xxx 这样的，要处理成/Users/xxx/xxx
            if (pathPrefix.startsWith('/local')) {
                if (pathPrefix.includes(':')) {
                    // Windows 路径
                    pathPrefix = pathPrefix.replace('/local/', '');
                } else {
                    // macOS/Linux 路径
                    pathPrefix = pathPrefix.replace('/local', '');
                }
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

            const results = await response.json();
            return results.map(item => ({
                id: item.id,
                title: item.title,
                description: item.description,
                date: new Date(item.date),
                url: item.url,
                content: item.content,
                paragraphOrder: item.paragraphOrder
            }));
        } catch (error) {
            console.error('Fetch aggregated content failed:', error);
            throw error;
        }
    }

    async getAllPossiblePath() {
        if (!this.BASE_URL) {
            console.error('Failed to get paths from plugin /local/: Local server is not available');
            return [];
        }
        try {
            const response = await fetch(`${this.BASE_URL}/getAllPaths`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
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
        return '本机文件检索';
    }


    getHandlerCategory() {
        return '本地文件检索';
    }
    
    getBeginPath() {
        return '/local/';
    }

    getInterfaceDescription() {
        return '对本机的目录构建索引，您可以让大模型依托于本地文件来回答问题，比较方便可以下载一些pdf文件或网页到本地来依托这些内容回答问题';
    }
}

export default LocalServerIndexHandlerImpl;
