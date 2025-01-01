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
    addPluginTemplate(handlerInterfaceName, pluginCode) {
        if (!handlerInterfaceName || !pluginCode) {
            throw new Error('HandlerInterfaceName and pluginCode are required');
        }
        const templates = this.pluginTemplateStore.get('templates', {});
        templates[handlerInterfaceName] = pluginCode;
        this.pluginTemplateStore.set('templates', templates);
    }

    removePluginTemplate(handlerInterfaceName) {
        const templates = this.pluginTemplateStore.get('templates', {});
        if (templates[handlerInterfaceName]) {
            delete templates[handlerInterfaceName];
            this.pluginTemplateStore.set('templates', templates);
            return true;
        }
        return false;
    }

    updatePluginTemplate(handlerInterfaceName, pluginCode) {
        if (!this.getPluginTemplate(handlerInterfaceName)) {
            throw new Error(`Plugin template ${handlerInterfaceName} not found`);
        }
        this.addPluginTemplate(handlerInterfaceName, pluginCode);
    }

    getPluginTemplate(handlerInterfaceName) {
        const templates = this.pluginTemplateStore.get('templates', {});
        return templates[handlerInterfaceName];
    }

    getAllPluginTemplates() {
        return this.pluginTemplateStore.get('templates', {});
    }

    // Instance Store 操作方法
    addInstanceConfig(pathPrefix, handlerConfig) {
        if (!pathPrefix || !handlerConfig) {
            throw new Error('PathPrefix and handlerConfig are required');
        }
        const instances = this.instanceStore.get('instances', {});
        instances[pathPrefix] = handlerConfig;
        this.instanceStore.set('instances', instances);
    }

    removeInstanceConfig(pathPrefix) {
        const instances = this.instanceStore.get('instances', {});
        if (instances[pathPrefix]) {
            delete instances[pathPrefix];
            this.instanceStore.set('instances', instances);
            return true;
        }
        return false;
    }

    updateInstanceConfig(pathPrefix, handlerConfig) {
        if (!this.getInstanceConfig(pathPrefix)) {
            throw new Error(`Instance config ${pathPrefix} not found`);
        }
        this.addInstanceConfig(pathPrefix, handlerConfig);
    }

    getInstanceConfig(pathPrefix) {
        const instances = this.instanceStore.get('instances', {});
        return instances[pathPrefix];
    }

    getAllInstanceConfigs() {
        return this.instanceStore.get('instances', {});
    }

    // 清理方法
    clearAllData() {
        this.pluginTemplateStore.clear();
        this.instanceStore.clear();
    }

    // 实用方法
    hasPluginTemplate(handlerInterfaceName) {
        const templates = this.pluginTemplateStore.get('templates', {});
        return !!templates[handlerInterfaceName];
    }

    hasInstanceConfig(pathPrefix) {
        const instances = this.instanceStore.get('instances', {});
        return !!instances[pathPrefix];
    }
}

// 创建单例
const pluginStore = new PluginStore();
Object.freeze(pluginStore);

export default pluginStore;
