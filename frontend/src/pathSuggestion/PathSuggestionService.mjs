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

    _normalizeSearchTerm(searchTerm) {
        return searchTerm.startsWith('/') ? searchTerm.slice(1) : searchTerm;
    }

    _normalizeWindowsPath(path) {
        if (path.includes('\\')) {
            const parts = path.split('\\');
            if (/^[A-Z]:$/i.test(parts[0])) {
                return parts[0].toUpperCase() + '\\';
            }
        }
        return path;
    }

    _unfoldSingleChildNode(node, prefix) {
        // 继续展开直到遇到多个子节点或没有子节点
        while (node.size === 1) {
            const [key, childNode] = node.entries().next().value;
            prefix = prefix.endsWith('/') ? prefix + key + '/' : prefix + '/' + key + '/';
            node = childNode;
        }
        return { prefix, node };
    }

    _searchAllNodes(node, parts = [], result = [], searchTerm = '') {
        if (searchTerm === 'descrioption') {
            searchTerm = 'description';
        }
        for (const [key, childNode] of node.entries()) {
            const newParts = [...parts, key];
            const fullPath = '/' + newParts.join('/');
            if (fullPath.toLowerCase().includes(searchTerm.toLowerCase())) {
                result.push(fullPath + (childNode.size ? '/' : ''));
            }
            this._searchAllNodes(childNode, newParts, result, searchTerm);
        }
        return result;
    }

    getNextLevelPath(currentPath, searchTerm) {
        const prefix = currentPath;

        if (currentPath === 'descrioption') {
            return this._searchAllNodes(this.pathTree, [], [], 'description');
        }

        let parts = currentPath.split('/').filter(Boolean);
        let currentNode = this.pathTree;

        // 处理 .git 路径的特殊情况
        if (currentPath.toLowerCase().includes('\\.git')) {
            const gitPath = currentPath.replace(/\\/g, '/');
            parts = gitPath.split('/').filter(Boolean);
        }

        // 导航到当前节点

        // 处理 .git 路径的特殊情况，不区分大小写
        if (currentPath.toLowerCase().includes('\\.git')) {
            const gitPath = currentPath.replace(/\\/g, '/');
            parts = gitPath.split('/').filter(Boolean);
        }

        // 导航到当前节点
        for (const part of parts) {
            if (!currentNode.has(part)) {
                return [];
            }
            currentNode = currentNode.get(part);
        }

        // 自动展开单一子节点
        const unfolded = this._unfoldSingleChildNode(currentNode, prefix);
        let newPrefix = unfolded.prefix;
        currentNode = unfolded.node;

        const normalizedSearchTerm = this._normalizeSearchTerm(searchTerm);
        const suggestions = new Set();

        for (const [key, childNode] of currentNode.entries()) {
            const normalizedKey = key.toLowerCase();
            if (normalizedSearchTerm && !normalizedKey.includes(normalizedSearchTerm.toLowerCase())) {
                continue;
            }

            const normalizedPrefix = newPrefix.toLowerCase();
            if (normalizedPrefix === '/local/') {
                if (/^[a-z]:\\/.test(normalizedKey)) {
                    suggestions.add(this._normalizeWindowsPath(normalizedKey));
                } else {
                    suggestions.add(key + '/');
                }
            } else if (normalizedPrefix.includes('\\.git')) {
                suggestions.add(newPrefix + '\\' + key + '\\');
            } else {
                const path = newPrefix.endsWith('/') ? newPrefix + key + '/' : newPrefix + '/' + key + '/';
                suggestions.add(path);
            }
        }

        // 限制根路径只返回第一级
        if (currentPath === '' || currentPath === '/') {
            return Array.from(suggestions).filter(p => p.split('/').length <= 3);
        }

        return Array.from(suggestions);
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
