import { IndexHandlerInterface } from '../component/indexHandler/indexHandlerInter.mjs';
import { LLMBasedRerankImpl } from '../component/rerank/llmbasedRerankImpl.mjs';
import axios from 'axios';

const API_ENDPOINT = "https://yuque-api.antfin-inc.com/api/v2";
const YUQUE_ACCESS_URL = "https://yuque.alibaba-inc.com/";

export class YuqueIndexHandlerImpl extends IndexHandlerInterface {
    constructor() {
        super();
        this.rerankImpl = new LLMBasedRerankImpl(/* isDebugModel */);
    }

    async loadConfig(config) {
        this.handlerConfig = config;
        this.user = config.user;
        this.authToken = config.authToken;
        this.client = axios.create({
            baseURL: API_ENDPOINT,
            headers: { 'X-Auth-Token': this.authToken }
        });
    }

    async rewriteQuery(query) {
        return [query];
    }

    async rerank(documentPartList, queryString) {
        if (!Array.isArray(documentPartList) || typeof queryString !== 'string') {
            throw new TypeError('Invalid input types for rerank method');
        }
        return await this.rerankImpl.rerank(documentPartList, queryString);
    }
    
    getInterfaceDescription() {
        return "This is a Yuque based index implementation";
    }

    getHandlerName() {
        return 'YuqueIndexHandlerImpl';
    }

    async getPossiblePath(path) {
        if (this.handlerConfig.user.id !== this.user.id) {
            return [];
        }

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
        } else {
            const group = pathPrefix.split('/')[2];
            const url = `/groups/${group}/repos`;
            const response = await this.client.get(url);
            const bookIds = response.data.data.map(item => item.slug + '/');
            for (const bookId of bookIds) {
                const wholePath = pathPrefix + bookId;
                if (wholePath.startsWith(path)) {
                    possiblePaths.push(wholePath.substring(path.length));
                }
            }
        }

        return possiblePaths;
    }

    async search(query, pathPrefix = '', TopN = 20) {
        const url = `/search?q=${query}&type=doc&scope=${pathPrefix}&page=1&limit=${TopN}`;
        const response = await this.client.get(url);
        const results = response.data.data.map(item => ({
            id: item.id,
            title: this.removeHtmlTags(item.title),
            highLightContentPart: this.removeHtmlTags(item.summary),
            markdownParagraph: this.getDocumentDetail(pathPrefix, item.id.toString())
        }));
        return results;
    }

    async getDocumentDetail(prefix, docId) {
        const url = `/repos/${prefix}/docs/${docId}`;
        const response = await this.client.get(url);
        const data = response.data.data;
        return {
            id: data.id,
            content: data.body,
            documentData: {
                fileName: data.title,
                filePath: `${YUQUE_ACCESS_URL}${prefix}/${docId}`,
                user: this.user
            }
        };
    }

    removeHtmlTags(text) {
        return text.replace(/<[^>]*>/g, '');
    }
}
