import { IndexHandlerInterface } from '../component/indexHandler/indexHandlerInter.mjs';
import { LLMBasedRerankImpl } from '../component/rerank/llmbasedRerankImpl.mjs';
import axios from 'axios';

export class YuqueIndexHandlerImpl extends IndexHandlerInterface {
    constructor() {
        super();
    }

    async init(globalContext, config) {
        console.debug(`Loading config: ${JSON.stringify(config)}`);
        this.handlerConfig = config;
        this.pathPrefix = this.handlerConfig.pathPrefix || '';
        this.group_slug = this.pathPrefix.split('/')[2];
        this.authToken = config.authToken;
        this.apiEndpoint = config.api_endpoint || "https://yuque-api.antfin-inc.com/api/v2/";
        this.yuqueAccessUrl = config.yuque_access_url || "https://yuque.alibaba-inc.com/";
        this.client = axios.create({
            baseURL: this.apiEndpoint,
            headers: { 'X-Auth-Token': this.authToken }
        });

        this.rerankImpl = globalContext.rerankImpl;
        this.rewriteQueryer = globalContext.rewriteQueryer;
        console.debug(`YuqueIndexHandlerImpl loaded with pathPrefix: ${this.pathPrefix}`);
        console.debug(`group_slug: ${this.group_slug},rerankImpl: ${this.rerankImpl}, authToken: ${this.authToken}`);
    }

    async rewriteQuery(query) {
        console.debug(`Rewriting query: ${query}`);
        if (!this.rewriteQueryer) {
            throw new Error("No query rewriter found");
        }else
        {
            return await this.rewriteQueryer.rewriteQuery(query);
        }
    }

    async rerank(documentPartList, queryString) {
        console.debug(`Reranking documents with query: ${queryString}`);
        if (!Array.isArray(documentPartList) || typeof queryString !== 'string') {
            throw new TypeError('Invalid input types for rerank method');
        }
        console.debug(this.rerankImpl);
        return await this.rerankImpl.rerank(documentPartList, queryString);
    }

    getInterfaceDescription() {
        console.debug(`Getting interface description.`);
        return "This is a Yuque based index implementation";
    }

    getHandlerName() {
        console.debug(`Getting handler name.`);
        return 'YuqueIndexHandlerImpl';
    }

    async getPossiblePath(path) {
        const pathPrefix = this.pathPrefix;
        if (!pathPrefix.endsWith('/')) {
            throw new Error("Path prefix should end with /");
        }

        const possiblePaths = [];
        console.debug(`getPossiblePath called with path: ${path}`);
        console.debug(`Handler config pathPrefix: ${pathPrefix}`);

        if (path.length < pathPrefix.length) {
            const relativePath = pathPrefix.substring(path.length);
            console.debug(`Relative path: ${relativePath}`);
            if (relativePath) {
                const nextSlashIndex = relativePath.indexOf('/');
                if (nextSlashIndex !== -1) {
                    possiblePaths.push(relativePath.substring(0, nextSlashIndex + 1));
                } else {
                    possiblePaths.push(relativePath);
                }
            }
        } else {
            const group = pathPrefix.split('/')[2];
            const url = `groups/${group}/repos`;
            console.debug(`Fetching repos from URL: ${url}`);
            const response = await this.client.get(url);

            // 添加日志检查 response.data 的结构
            console.debug(`Response data: ${JSON.stringify(response.data)}`);

            if (response.data && response.data.data) {
                const bookIds = response.data.data.map(item => item.slug + '/');
                for (const bookId of bookIds) {
                    const wholePath = pathPrefix + bookId;
                    console.debug(`Checking wholePath: ${wholePath}`);
                    if (wholePath.startsWith(path)) {
                        possiblePaths.push(wholePath.substring(path.length));
                    }
                }
            } else {
                throw new Error("Unexpected response structure");
            }
        }

        console.debug(`Possible paths: ${JSON.stringify(possiblePaths)}`);
        return possiblePaths;
    }

    async search(query, pathPrefix = '', TopN = 20) {
        const configPathPrefix = this.pathPrefix;
    
        // 提取 handlerConfig.pathPrefix 的第一段 /yuque.alibaba-inc.com/
        const firstSegment = configPathPrefix.split('/').slice(0, 2).join('/') + '/';
    
        // 异常检查，确保 pathPrefix 以 firstSegment 开头
        if (!pathPrefix.startsWith(firstSegment)) {
            throw new Error(`Invalid pathPrefix: ${pathPrefix}. It must start with ${firstSegment}`);
        }
    
        // 提取 scope 参数
        let remainingPath = pathPrefix.slice(firstSegment.length);
        console.debug(`Remaining path: ${remainingPath}`);
     
        if (remainingPath.endsWith('/')) {
            remainingPath = remainingPath.slice(0, -1);
        }
        console.debug(`Remaining path after removing trailing slash: ${remainingPath}`);
        const scope = remainingPath;
        const encodedQuery = encodeURIComponent(query);
        const encodedScope = encodeURIComponent(scope);
        const url = `search?q=${encodedQuery}&type=doc&scope=${encodedScope}&page=1&limit=${TopN}`;
        console.debug(`Search URL: ${url}`);
    
        try {
            const response = await this.client.get(url);
            console.debug(`Search response data: ${JSON.stringify(response.data)}`);
            const results = response.data.data.map(item => ({
                id: item.id,
                title: this.removeHtmlTags(item.title),
                description: this.removeHtmlTags(item.summary),
                url: `${this.yuqueAccessUrl}${item.url.slice(1)}`,
              }));
            console.debug(`Search results: ${JSON.stringify(results)}`);
            return results;
        } catch (error) {
            console.error(`Error occurred during search: ${error}`);
        }
    }

    async getDocumentDetail(prefix, docId) {
        const url = `repos/${prefix}/docs/${docId}`;
        console.debug(`Fetching document detail from URL: ${url}`);
        try {
            const response = await this.client.get(url);
            console.debug(`Document detail response data: ${JSON.stringify(response.data)}`);
            const data = response.data.data;
            console.debug(`Document detail data: ${JSON.stringify(data)}`);
            return {
                id: data.id,
                content: data.body,
                documentData: {
                    fileName: data.title,
                    filePath: `${this.yuqueAccessUrl}${prefix}/${docId}`,
                    user: this.user
                }
            };
        } catch (error) {
            console.error(`Error fetching document detail from URL: ${url}`, error);
            throw new Error(`Failed to fetch document detail for docId: ${docId}`);
        }
    }

    removeHtmlTags(text) {
        console.debug(`Removing HTML tags from text.`);
        return text.replace(/<[^>]*>/g, '');
    }

    async fetchAggregatedContent(summaryList) {
        for (const item of summaryList) {
            const urlParts = item.url.split('/');

            const bookTokenFromUrl = urlParts[urlParts.length - 2];

            const docId = urlParts[urlParts.length - 1];
            const detailUrl = `${this.apiEndpoint}repos/${this.group_slug}/${bookTokenFromUrl}/docs/${docId}`;
            console.debug(`Fetching document detail from URL: ${detailUrl}`);
            try {
                const response = await this.client.get(detailUrl);
                console.debug(`Document detail response data: ${JSON.stringify(response.data)}`);
                item.content = response.data.data.body;
            } catch (error) {
                console.error(`Error fetching document detail from URL: ${detailUrl}`, error);
            }
        }
        return summaryList;
    }
}
