import Store from 'electron-store';

class PluginStore {
    constructor() {
        if (PluginStore.instance) {
            return PluginStore.instance;
        }
        
        this.pluginTemplateStore = new Store({ name: 'pluginTemplates' });
        this.instanceStore = new Store({ name: 'pluginInstancesConfig' });
        PluginStore.instance = this;
    }

    // Plugin Template Store 操作方法
    putPluginTemplate(handlerInterfaceName, pluginCode) {
        if (!handlerInterfaceName || !pluginCode) {
            throw new Error('HandlerInterfaceName and pluginCode are required');
        }
        this.pluginTemplateStore.set(handlerInterfaceName, pluginCode);
    }

    removePluginTemplate(handlerInterfaceName) {
        if (this.pluginTemplateStore.has(handlerInterfaceName)) {
            this.pluginTemplateStore.delete(handlerInterfaceName);
            return true;
        }
        return false;
    }

    getPluginTemplate(handlerInterfaceName) {
        return this.pluginTemplateStore.get(handlerInterfaceName);
    }

    getAllPluginTemplates() {
        return this.pluginTemplateStore.store;
    }

    // Instance Store 操作方法
    encodePathPrefix(pathPrefix) {
        // 方案1：使用 Base64 编码
        return Buffer.from(pathPrefix).toString('base64');
        
        // 或者方案2：替换特殊字符
        // return pathPrefix.replace(/[\/\.]/g, '_');
    }

    decodePathPrefix(encodedPrefix) {
        // 方案1：Base64 解码
        return Buffer.from(encodedPrefix, 'base64').toString();
        
        // 或者方案2：还原特殊字符
        // return encodedPrefix.replace(/_/g, '/');
    }

    putInstanceConfig(pathPrefix, handlerConfig) {
        if (!pathPrefix || !handlerConfig) {
            throw new Error('PathPrefix and handlerConfig are required');
        }
        const encodedKey = this.encodePathPrefix(pathPrefix);
        this.instanceStore.set(encodedKey, handlerConfig);
    }

    removeInstanceConfig(pathPrefix) {
        const encodedKey = this.encodePathPrefix(pathPrefix);
        if (this.instanceStore.has(encodedKey)) {
            this.instanceStore.delete(encodedKey);
            return true;
        }
        return false;
    }

    getInstanceConfig(pathPrefix) {
        const encodedKey = this.encodePathPrefix(pathPrefix);
        return this.instanceStore.get(encodedKey);
    }

    getAllInstanceConfigs() {
        const configs = {};
        for (const [encodedKey, config] of Object.entries(this.instanceStore.store)) {
            const originalKey = this.decodePathPrefix(encodedKey);
            configs[originalKey] = config;
        }
        return configs;
    }

    // 清理方法
    clearAllData() {
        this.pluginTemplateStore.clear();
        this.instanceStore.clear();
    }

    // 实用方法
    hasPluginTemplate(handlerInterfaceName) {
        return this.pluginTemplateStore.has(handlerInterfaceName);
    }

    hasInstanceConfig(pathPrefix) {
        const encodedKey = this.encodePathPrefix(pathPrefix);
        return this.instanceStore.has(encodedKey);
    }
}

// 创建单例
const pluginStore = new PluginStore();
Object.freeze(pluginStore);

export default pluginStore;
