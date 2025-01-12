export class PathSuggestionService {
    constructor() {
        // 预配置的关键词到完整路径的映射
        this.keywordPathMap = new Map();
        this.pluginPathMap = new Map(); // 存储路径与插件的映射关系
    }

    async initWithPlugins(plugins) {
        this.pluginPathMap.clear();
        this.keywordPathMap.clear();

        // 收集所有插件的路径信息
        for (const [pathPrefix, plugin] of plugins) {
            try {
                const paths = await plugin.getAllPossiblePath();
                paths.forEach(path => {
                    // 将 Windows 风格路径转换为 Unix 风格路径
                    const normalizedPath = path.replace(/\\/g, '/');
                    this.addPathToTree(normalizedPath, plugin);
                });
            } catch (error) {
                console.error(`Failed to get paths from plugin ${pathPrefix}:`, error);
            }
        }
    }

    addPathToTree(normalizedPath, plugin) {
        // 去掉文件，只保留目录
        const directoryPath = normalizedPath.endsWith('/') ? normalizedPath : normalizedPath.slice(0, normalizedPath.lastIndexOf('/') + 1);
        this.pluginPathMap.set(directoryPath, plugin);
    }

    getNextLevelPath(keywords) {
        // 将 Windows 风格路径转换为 Unix 风格路径
        keywords = keywords.replace(/\\/g, '/');
        const result = new Set();

        for (const path of this.pluginPathMap.keys()) {
            // 去掉文件名字，只留下目录
            const directoryPath = path.endsWith('/') ? path : path.slice(0, path.lastIndexOf('/') + 1);

            if (directoryPath.includes(keywords)) {
                const remainingPath = directoryPath.slice(directoryPath.indexOf(keywords) + keywords.length);
                const nextSlashIndex = remainingPath.indexOf('/');

                if (nextSlashIndex !== -1) {
                    const nextLevelPath = directoryPath.slice(0, directoryPath.indexOf(keywords) + keywords.length + nextSlashIndex + 1);
                    result.add(nextLevelPath);
                } else if (remainingPath.length > 0) {
                    result.add(directoryPath);
                }
            }
        }

        return Array.from(result).sort();
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


    // 提供类似原getPossiblePath的功能
    async getPossibleChildPaths(currentPath, searchTerm = '') {
        return this.getNextLevelPath(currentPath, searchTerm);
    }
}

export default PathSuggestionService;
