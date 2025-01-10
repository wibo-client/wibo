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
        // 将 Windows 风格路径转换为 Unix 风格路径
        currentPath = currentPath.replace(/\\/g, '/');

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

        // 步骤1：用关键词搜索，找到所有匹配该关键词的路径
        const matchingPaths = new Map();
        const traverse = (node, path) => {
            for (const [key, childNode] of node) {
                const fullPath = `${path}${key}/`;
                if (key.toLowerCase().includes(searchLower)) {
                    const keywordIndex = fullPath.toLowerCase().indexOf(searchLower);
                    const prefix = fullPath.substring(0, keywordIndex + searchLower.length);
                    let suffix = fullPath.substring(keywordIndex + searchLower.length);
                    // 去掉文件，只记录目录部分
                    if (!suffix.endsWith('/')) {
                        suffix = suffix.substring(0, suffix.lastIndexOf('/') + 1);
                    }
                    if (!matchingPaths.has(prefix)) {
                        matchingPaths.set(prefix, new Set());
                    }
                    matchingPaths.get(prefix).add(suffix);
                }
                traverse(childNode, fullPath);
            }
        };
        traverse(currentNode, currentPath.endsWith('/') ? currentPath : `${currentPath}/`);

        // 步骤2：基于已有的前向有限分支+路径当前位置，往下延展直到下一个/
        const nodeTree = new Map();
        matchingPaths.forEach((suffixes, prefix) => {
            suffixes.forEach(suffix => {
                const fullPath = prefix + suffix;
                const parts = fullPath.split('/').filter(Boolean);
                let currentNode = nodeTree;
                parts.forEach(part => {
                    if (!currentNode.has(part)) {
                        currentNode.set(part, new Map());
                    }
                    currentNode = currentNode.get(part);
                });
            });
        });

        const traverseNodeTree = (node, path) => {
            if (node.size === 1) {
                for (const [key, childNode] of node) {
                    traverseNodeTree(childNode, `${path}${key}/`);
                }
            } else {
                for (const [key, childNode] of node) {
                    result.push(`${path}${key}/`);
                }
            }
        };

        nodeTree.forEach((childNode, key) => {
            traverseNodeTree(childNode, `/${key}/`);
        });

        return result;
    }

    selectPluginForPath(pathPrefix = '') {
        // 查找最匹配的插件
        let longestMatch = '';
        let selectedPlugin = null;

        for (const [path, plugin] of this.pluginPathMap) {
            if (path.startsWith(pathPrefix) && path.length > longestMatch.length) {
                longestMatch = path;
                selectedPlugin = plugin;
                return selectedPlugin;
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
