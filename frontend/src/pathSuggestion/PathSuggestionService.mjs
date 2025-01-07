export class PathSuggestionService {
    constructor() {
        // 预配置的关键词到完整路径的映射
        this.keywordPathMap = new Map();
        // 路径树结构
        this.pathTree = new Map();
        this.pluginPathMap = new Map(); // 存储路径与插件的映射关系
        this.updateInterval = 5 * 60 * 1000; // 5分钟更新一次
        this.lastUpdateTime = 0;
        this.plugins = null; // 存储插件引用
    }

    init(pathConfigs) {
        // 初始化关键词映射和路径树
        for (const config of pathConfigs) {
            this.addPathConfig(config);
        }
    }

    async initWithPlugins(plugins) {
        this.plugins = plugins; // 保存插件引用
        this.pluginPathMap.clear();
        this.pathTree.clear();
        this.keywordPathMap.clear();

        // 收集所有插件的路径信息
        for (const [pathPrefix, plugin] of plugins) {
            try {
                const paths = await plugin.getAllPossiblePath();
                paths.forEach(path => {
                    this.pluginPathMap.set(path, plugin);
                    this.addPathToTree(path);
                });
            } catch (error) {
                console.error(`Failed to get paths from plugin ${pathPrefix}:`, error);
            }
        }
    }

    addPathConfig(config) {
        // 添加关键词到完整路径的映射
        if (config.keywords) {
            config.keywords.forEach(keyword => {
                this.keywordPathMap.set(keyword, config.fullPath);
            });
        }

        // 构建路径树
        const parts = config.fullPath.split('/').filter(Boolean);
        let currentNode = this.pathTree;
        for (const part of parts) {
            if (!currentNode.has(part)) {
                currentNode.set(part, new Map());
            }
            currentNode = currentNode.get(part);
        }
    }

    addPathToTree(path) {
        const parts = path.split('/').filter(Boolean);
        let currentNode = this.pathTree;
        for (const part of parts) {
            if (!currentNode.has(part)) {
                currentNode.set(part, new Map());
            }
            currentNode = currentNode.get(part);
        }
    }

    getNextLevelPath(currentPath, searchTerm) {
        // 获取当前路径的下一级可能路径
        const parts = currentPath.split('/').filter(Boolean);
        let currentNode = this.pathTree;
        
        // 导航到当前路径所在节点
        for (const part of parts) {
            if (!currentNode.has(part)) {
                return [];
            }
            currentNode = currentNode.get(part);
        }

        // 根据搜索词过滤下一级路径
        const suggestions = [];
        for (const [key] of currentNode) {
            if (searchTerm && !key.toLowerCase().includes(searchTerm.toLowerCase())) {
                continue;
            }
            suggestions.push(key + '/');
        }

        return suggestions;
    }

    selectPluginForPath(pathPrefix = '') {
        // 查找最匹配的插件
        let longestMatch = '';
        let selectedPlugin = null;

        for (const [path, plugin] of this.pluginPathMap) {
            if (pathPrefix.startsWith(path) && path.length > longestMatch.length) {
                longestMatch = path;
                selectedPlugin = plugin;
            }
        }

        return selectedPlugin;
    }

    getFullPathByKeyword(keyword) {
        // 根据关键词查找完整路径
        if (!keyword) {
            return [];
        }

        const results = [];
        for (const [key, path] of this.keywordPathMap) {
            if (key.toLowerCase().includes(keyword.toLowerCase())) {
                results.push(path);
            }
        }

        return results;
    }

    async ensureUpdated() {
        const now = Date.now();
        if (now - this.lastUpdateTime > this.updateInterval) {
            await this.updatePathSuggestions();
            this.lastUpdateTime = now;
        }
    }

    async getAllPathSuggestions(searchTerm) {
        await this.ensureUpdated();
        const suggestions = new Set();
        
        // 从路径树中获取建议
        if (searchTerm) {
            for (const [path, plugin] of this.pluginPathMap) {
                if (path.toLowerCase().includes(searchTerm.toLowerCase())) {
                    suggestions.add(path);
                }
            }
        }

        // 从关键词映射中获取建议
        const keywordResults = await this.getFullPathByKeyword(searchTerm);
        keywordResults.forEach(path => suggestions.add(path));

        return Array.from(suggestions);
    }

    // 提供类似原getPossiblePath的功能
    async getPossibleChildPaths(currentPath, searchTerm = '') {
        await this.ensureUpdated();
        return this.getNextLevelPath(currentPath, searchTerm);
    }

    async updatePathSuggestions() {
        if (!this.plugins) {
            return;
        }
        // 重新获取所有插件的路径
        await this.initWithPlugins(this.plugins);
    }
}

export default PathSuggestionService;
