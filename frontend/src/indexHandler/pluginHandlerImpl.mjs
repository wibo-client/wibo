import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import BaiduPuppeteerIndexHandlerImpl from './baiduPuppeteerIndexHandlerImpl.mjs';
import fs from 'fs';
import vm from 'vm';
import pluginStore from './pluginStore.mjs';
import { PathSuggestionService } from '../pathSuggestion/PathSuggestionService.mjs';

export class PluginHandlerImpl {
    constructor() {
        this.pluginInstanceMap = new Map();
        this.pathSuggestionService = new PathSuggestionService();
    }

    async init(globalContext) {
        this.globalContext = globalContext;
        this.globalConfig = globalContext.globalConfig;
        this.defaultHandler = new BaiduPuppeteerIndexHandlerImpl();
        await this.defaultHandler.init(globalContext, null);
        this.mktplaceUrl = this.globalConfig.mktplaceUrl || 'localhost:8080';
        this.loadPlugins();
        await this.updatePathSuggestions();
    }

    async updatePathSuggestions() {
        await this.pathSuggestionService.initWithPlugins(this.pluginInstanceMap);
    }

    async storePlugin(pluginClass, pluginCode, handlerConfig) {
        try {
            // 存储插件模板
            const name = pluginClass.name;
            pluginStore.putPluginTemplate(name, pluginCode);
            console.debug(`Stored plugin template in store: ${name}`);

            // 存储实例配置
            pluginStore.putInstanceConfig(handlerConfig.pathPrefix, handlerConfig);
            console.debug(`Stored instance config in store: ${handlerConfig.pathPrefix}`);

            console.log(`Plugin ${name} and its config added successfully.`);
            await this.loadPlugins();
        } catch (error) {
            console.error("Failed to store plugin and config:", error);
            throw new Error("Failed to store plugin and config");
        }
    }

    async initializePluginInstance(PluginClass, handlerConfig, pluginCode = null) {
        const evaluatedModule = this.evaluateModule(pluginCode || PluginClass);
        const pluginInstance = new evaluatedModule[handlerConfig.indexHandlerInterface]();
        
        await pluginInstance.init(this.globalContext, handlerConfig);
        const description = pluginInstance.getInterfaceDescription();
        console.log(`Plugin description: ${description}`);

        if (pluginCode) {  // 仅在添加新插件时检查
            const handlerName = pluginInstance.getHandlerName();
            if (!handlerName) {
                throw new Error("Handler name is empty, cannot add plugin to map.");
            }
        }

        if (this.pluginInstanceMap.has(handlerConfig.pathPrefix)) {
            throw new Error(`Plugin with the same pathPrefix already exists: ${handlerConfig.pathPrefix}`);
        }

        if (this.validatePlugin(pluginInstance.constructor)) {
            this.pluginInstanceMap.set(handlerConfig.pathPrefix, pluginInstance);
            if (pluginCode) {
                await this.storePlugin(PluginClass, pluginCode, handlerConfig);
            }
            return true;
        }
        return false;
    }

    async loadPlugins() {
        try {
            console.debug(`Loading plugins.`);
            this.pluginInstanceMap.clear();
            
            const instanceConfigs = pluginStore.getAllInstanceConfigs();
            const templates = pluginStore.getAllPluginTemplates();

            for (const [pathPrefix, handlerConfig] of Object.entries(instanceConfigs)) {
                const PluginClass = templates[handlerConfig.indexHandlerInterface];
                if (!PluginClass) {
                    console.warn(`Plugin code not found for ${handlerConfig.indexHandlerInterface}`);
                    continue;
                }

                const success = await this.initializePluginInstance(PluginClass, handlerConfig);
                if (success) {
                    console.log(`Plugin ${handlerConfig.indexHandlerInterface} loaded successfully from store.`);
                } else {
                    console.warn(`Plugin ${handlerConfig.indexHandlerInterface} does not implement all methods from IndexHandlerInterface and will be ignored.`);
                }
            }
            await this.updatePathSuggestions();
        } catch (error) {
            console.error("Failed to load plugins:", error);
            throw new Error("Failed to load plugins");
        }
    }
    
    async addPluginTemplateFromFile(filePath) {
        try {
            console.debug(`Adding plugin template from file: ${filePath}`);
            const pluginCode = await fs.promises.readFile(filePath, 'utf-8');
            const configFilePath = filePath.replace(/\.js$/, '.json');
            const handlerConfig = JSON.parse(await fs.promises.readFile(configFilePath, 'utf-8'));
            const evaluatedModule = this.evaluateModule(pluginCode);
            const PluginClass = evaluatedModule[handlerConfig.indexHandlerInterface];

            const success = await this.initializePluginInstance(PluginClass, handlerConfig, pluginCode);
            if (success) {
                console.log(`Plugin ${filePath} loaded successfully from file.`);
            } else {
                console.warn(`Plugin ${filePath} does not implement all methods from IndexHandlerInterface and will be ignored.`);
            }
        } catch (error) {
            console.error("Failed to add plugin from file:", error);
            throw new Error("Failed to add plugin from file");
        }
    }

    evaluateModule(code) {
        console.debug(`Evaluating module code.`);
        const script = new vm.Script(code, { filename: 'virtual-module.js' });
        const sandbox = {
            module: { exports: {} },
            exports: {},
            require: (moduleName) => {
                return require(moduleName);
            }
        };
        const context = vm.createContext(sandbox);
        script.runInContext(context);
        return sandbox.module.exports;
    }

    validatePlugin(plugin) {
        console.debug(`Validating plugin.`);
        const interfaceMethods = Object.getOwnPropertyNames(IndexHandlerInterface.prototype).filter(method => method !== 'constructor');
        const pluginMethods = Object.getOwnPropertyNames(plugin.prototype);

        const missingMethods = interfaceMethods.filter(method => !pluginMethods.includes(method));
        if (missingMethods.length > 0) {
            console.warn(`Plugin is missing the following methods: ${missingMethods.join(', ')}`);
        }

        return missingMethods.length === 0;
    }

    async deletePlugin(pathPrefix) {
        console.debug(`Deleting plugin with pathPrefix: ${pathPrefix}`);
        if (!this.pluginInstanceMap.has(pathPrefix)) {
            throw new Error(`Plugin with pathPrefix ${pathPrefix} does not exist.`);
        }

        // 1. 获取要删除的实例配置
        const handlerConfig = pluginStore.getInstanceConfig(pathPrefix);
        const interfaceName = handlerConfig.indexHandlerInterface;

        // 2. 检查其他实例是否还在使用相同的插件模板
        const instanceConfigs = pluginStore.getAllInstanceConfigs();
        const otherInstancesUsingTemplate = Object.entries(instanceConfigs)
            .filter(([prefix, config]) => 
                prefix !== pathPrefix && 
                config.indexHandlerInterface === interfaceName
            );

        // 3. 删除实例
        this.pluginInstanceMap.delete(pathPrefix);
        pluginStore.removeInstanceConfig(pathPrefix);

        // 4. 如果没有其他实例使用该模板，则删除模板
        if (otherInstancesUsingTemplate.length === 0) {
            console.debug(`No other instances using template ${interfaceName}, removing template.`);
            pluginStore.removePluginTemplate(interfaceName);
        }

        console.log(`Plugin with pathPrefix ${pathPrefix} deleted successfully.`);
    }

    async select(pathPrefix = '') {
        const selectedPlugin = this.pathSuggestionService.selectPluginForPath(pathPrefix);
        return selectedPlugin || this.defaultHandler;
    }

    async fetchPathSuggestions(input) {
        return await this.pathSuggestionService.getAllPathSuggestions(input);
    }
}

export default PluginHandlerImpl;