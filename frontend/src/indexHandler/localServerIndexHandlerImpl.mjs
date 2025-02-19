import { AbstractIndexHandler } from './abstractIndexHandler.mjs';
import logger from '../utils/loggerUtils.mjs';

export class LocalServerIndexHandlerImpl extends AbstractIndexHandler {
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
            //console.log('[LocalServerIndexHandler] Base URL updated:', this.BASE_URL);
        } else {
            this.BASE_URL = null;
            console.log('[LocalServerIndexHandler] Server is not available');
        }
    }

    async deepSearch_collectFacts(query, path, requestContext) {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            // 处理路径前缀
            let processedPath = path;
            if (path.startsWith('/local')) {
                if (path.includes(':')) {
                    processedPath = path.replace('/local/', '');
                } else {
                    processedPath = path.replace('/local', '');
                }
            }

            if (path.includes(':')) {
                processedPath = processedPath.replace(/\//g, '\\');
            }

            // 1. 提交任务
            const submitResponse = await fetch(`${this.BASE_URL}/submitCollectFacts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: query,
                    pathPrefix: processedPath,
                }),
            });

            if (!submitResponse.ok) {
                throw new Error(`HTTP error! status: ${submitResponse.status}`);
            }

            // 2. 获取taskId
            const { taskId } = await submitResponse.json();
            let lastLogCount = 0;

            // 3. 轮询任务状态
            while (true) {
                const statusResponse = await fetch(`${this.BASE_URL}/collectFacts/${taskId}/status`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });

                if (!statusResponse.ok) {
                    throw new Error(`Failed to get task status: ${statusResponse.status}`);
                }

                const statusData = await statusResponse.json();
                if (!statusData) {
                    throw new Error('Task not found');
                }

                // 4. 更新系统日志
                if (statusData.systemLogs && statusData.systemLogs.length > lastLogCount) {
                    const newLogs = statusData.systemLogs.slice(lastLogCount);
                    for (const log of newLogs) {
                        requestContext.sendSystemLog(log);
                    }
                    lastLogCount = statusData.systemLogs.length;
                }
                logger.debug(`Task is aborted? ${requestContext.abortSignal.aborted}`);
                // 检查是否被中止
                if (requestContext.abortSignal.aborted) {
                    logger.info(`Task ${taskId} was aborted by user`);
                    await fetch(`${this.BASE_URL}/collectFacts/${taskId}/cancel`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    });
                    throw new Error('Task was aborted by user');
                }
                // 5. 检查任务状态并返回结果
                switch (statusData.status) {
                    case 'COMPLETED':
                        requestContext.results.parsedFacts = statusData.results || [];
                        requestContext.results.searchResults = statusData.results || [];
                        return;
                    case 'FAILED':
                        throw new Error(statusData.error || 'Task failed');
                    case 'CANCELLED':
                        throw new Error('Task was cancelled');
                    case 'PROCESSING':
                    case 'PENDING':
                        // 继续等待
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        break;
                    default:
                        throw new Error(`Unknown task status: ${statusData.status}`);
                }

                
            }
        } catch (error) {
            console.error('CollectFacts failed:', error);
            throw error;
        }
    }

    async search(queryStr, pathPrefix = '') {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            const configHandler = this.globalContext.configHandler;
            const searchItemNumbers = await configHandler.getSearchItemNumbers();

            // 处理路径前缀
            let processedPath = pathPrefix;
            if (pathPrefix.startsWith('/local')) {
                if (pathPrefix.includes(':')) {
                    // Windows 路径
                    processedPath = pathPrefix.replace('/local/', '');
                } else {
                    // macOS 路径
                    processedPath = pathPrefix.replace('/local', '');
                }
            }


            if (pathPrefix.includes(':')) {
                // Windows 路径
                processedPath = processedPath.replace(/\//g, '\\');
            }
            // 原有的目录搜索逻辑
            const response = await fetch(`${this.BASE_URL}/searchWithStrategy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: queryStr,
                    pathPrefix: processedPath,
                    TopN: searchItemNumbers
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Search failed:', error);
            throw error;
        }
    }

    async fetchAggregatedContent(summaryList,requestContext) {
        if (!this.BASE_URL) {
            throw new Error('Local server is not available');
        }

        try {
            const configHandler = this.globalContext.configHandler;
            const pageFetchLimit = await configHandler.getPageFetchLimit();

            // const limitedSummaryList = summaryList.slice(0, pageFetchLimit);
            const response = await fetch(`${this.BASE_URL}/fetchAggregatedContent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ summaryList: summaryList }),
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
                realUrl: item.url,
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
        const reWriteQuerys = await this.globalContext.rewriteQueryer.rewriteQuery(query);
        const queries = Array.isArray(reWriteQuerys) ? reWriteQuerys : [reWriteQuerys];
        return queries;
    }

    async rerank(documentPartList, queryString) {
        if (!Array.isArray(documentPartList) || typeof queryString !== 'string') {
            throw new TypeError('Invalid input types for rerank method');
        }
        return await this.globalContext.rerankImpl.rerank(documentPartList, queryString);
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
