export class PathSuggestionService {
    constructor() {
        // 预配置的关键词到完整路径的映射
        this.keywordPathMap = new Map();
        // 路径树结构
        this.pathTree = new Map();
        this.pluginPathMap = new Map(); // 存储路径与插件的映射关系
    }

    async initWithPlugins(plugins) {
        this.pluginPathMap.clear();
        this.pathTree.clear();
        this.keywordPathMap.clear();

        // 收集所有插件的路径信息
        for (const [pathPrefix, plugin] of plugins) {
            try {
                const paths = await plugin.getAllPossiblePath();
                paths.forEach(path => {
                    // 将 Windows 风格路径转换为 Unix 风格路径
                    const normalizedPath = path.replace(/\\/g, '/');
                    this.pluginPathMap.set(normalizedPath, plugin);
                    this.addPathToTree(normalizedPath);
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
        const parts = currentPath.split('/').filter(Boolean);
        let currentNode = this.pathTree;
        for (const part of parts) {
            if (currentNode.has(part)) {
                currentNode = currentNode.get(part);
            } else {
                return [];
            }
        }

        const result = [];
        const searchLower = searchTerm.toLowerCase();

        const traverse = (node, path) => {
            if (node.size === 1) {
                for (const [key, childNode] of node) {
                    traverse(childNode, `${path}${key}/`);
                }
            } else {
                for (const [key, childNode] of node) {
                    if (key.toLowerCase().includes(searchLower)) {
                        result.push(`${path}${key}/`);
                    }
                }
            }
        };

        traverse(currentNode, currentPath.endsWith('/') ? currentPath : `${currentPath}/`);
        return result;
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

    async getAllPathSuggestions(searchTerm) {
        const suggestions = new Set();

        if (searchTerm) {
            for (const [path, plugin] of this.pluginPathMap) {
                if (path.toLowerCase().includes(searchTerm.toLowerCase())) {
                    suggestions.add(path);
                }
            }
        }

        const keywordResults = this.getFullPathByKeyword(searchTerm);
        keywordResults.forEach(path => suggestions.add(path));

        return Array.from(suggestions);
    }

    // 提供类似原getPossiblePath的功能
    async getPossibleChildPaths(currentPath, searchTerm = '') {
        return this.getNextLevelPath(currentPath, searchTerm);
    }
}

export default PathSuggestionService;
