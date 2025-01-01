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
    putInstanceConfig(pathPrefix, handlerConfig) {
        if (!pathPrefix || !handlerConfig) {
            throw new Error('PathPrefix and handlerConfig are required');
        }
        this.instanceStore.set(pathPrefix, handlerConfig);
    }

    removeInstanceConfig(pathPrefix) {
        if (this.instanceStore.has(pathPrefix)) {
            this.instanceStore.delete(pathPrefix);
            return true;
        }
        return false;
    }

    getInstanceConfig(pathPrefix) {
        return this.instanceStore.get(pathPrefix);
    }

    getAllInstanceConfigs() {
        return this.instanceStore.store;
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
        return this.instanceStore.has(pathPrefix);
    }
}

// 创建单例
const pluginStore = new PluginStore();
Object.freeze(pluginStore);

export default pluginStore;
