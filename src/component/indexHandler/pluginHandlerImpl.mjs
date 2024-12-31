import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import BaiduPuppeteerIndexHandlerImpl from './baiduPuppeteerIndexHandlerImpl.mjs';
import XiaohongshuPuppeteerIndexHandlerImpl from '../../plugins/xiaohongshuPuppeteerIndexHandlerImpl.mjs';
import https from 'https';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import Store from 'electron-store';

export class PluginHandlerImpl {
    constructor() {
        this.pluginInstanceMap = new Map();
        this.pluginTemplateStore = new Store({ name: 'pluginTemplates' });
        this.instanceStore = new Store({ name: 'pluginInstancesConfig' });
        this.pluginTemplateStore.clear();
        this.instanceStore.clear();
    }

    async init(globalContext) {
        this.globalConfig = globalContext.globalConfig;
        this.defaultHandler = new XiaohongshuPuppeteerIndexHandlerImpl();
        await this.defaultHandler.init(globalContext, null);
        this.mktplaceUrl = this.globalConfig.mktplaceUrl || 'localhost:8080';
       
    }

    async storePluginInStore(pluginClass, content) {
        const name = pluginClass.name;
        const pluginTemplates = this.pluginTemplateStore.get('pluginTemplates', []);
        const existingPluginIndex = pluginTemplates.findIndex(plugin => plugin.name === name);
        if (existingPluginIndex !== -1) {
            console.log(`Plugin with name ${name} already exists. Updating content.`);
            pluginTemplates[existingPluginIndex].code = content;
        } else {
            pluginTemplates.push({ name, code: content });
        }
        this.pluginTemplateStore.set('pluginTemplates', pluginTemplates);
        console.debug(`Stored plugin in store: ${name}`);
    }

    async storeInstanceConfigInStore(name, config) {
        const pluginInstancesConfig = this.instanceStore.get('pluginInstancesConfig', []);
        const existingInstanceIndex = pluginInstancesConfig.findIndex(instance => instance.name === name);
        if (existingInstanceIndex !== -1) {
            console.log(`Instance config with name ${name} already exists. Updating config.`);
            pluginInstancesConfig[existingInstanceIndex].config = config;
        } else {
            pluginInstancesConfig.push({ name, config });
        }
        this.instanceStore.set('pluginInstancesConfig', pluginInstancesConfig);
        console.debug(`Stored instance config in store: ${name}`);
    }

    async addNewInstanceConfig(handlerConfig) {
        try {
            await this.storeInstanceConfigInStore(handlerConfig.pathPrefix, handlerConfig);
            console.log(`Instance config for ${handlerConfig.indexHandlerInterface} added successfully.`);
            await this.loadPlugins();
        } catch (error) {
            console.error("Failed to add new instance config:", error);
            throw new Error("Failed to add new instance config");
        }
    }

    async downloadPluginTemplate(url) {
        const fileName = new URL(url).pathname.split('/').pop();
        console.debug(`Downloading plugin template from URL: ${url}`);

        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download plugin: ${response.statusCode}`));
                    return;
                }

                let data = '';
                response.on('data', (chunk) => {
                    data += chunk;
                });

                response.on('end', async () => {
                    await this.storePluginInStore(fileName, data);
                    resolve(fileName);
                });
            }).on('error', (error) => {
                reject(error);
            });
        });
    }

    async addPluginTemplateFromFile(filePath) {
        try {
            console.debug(`Adding plugin template from file: ${filePath}`);
            const pluginCode = await fs.promises.readFile(filePath, 'utf-8');
            const configFilePath = filePath.replace(/\.js$/, '.json');
            const handlerConfig = JSON.parse(await fs.promises.readFile(configFilePath, 'utf-8'));
            const evaluatedModule = this.evaluateModule(pluginCode);

            const PluginClass = evaluatedModule[handlerConfig.indexHandlerInterface];

            // 调用加载的代码的 getInterfaceDescription 方法
            const pluginInstance = new PluginClass();
            await pluginInstance.init(handlerConfig);
            const description = pluginInstance.getInterfaceDescription();
            console.log(`Plugin description: ${description}`);

            const handlerName = pluginInstance.getHandlerName();
            if (!handlerName) {
                throw new Error("Handler name is empty, cannot add plugin to map.");
            }

            if (this.pluginInstanceMap.has(handlerConfig.pathPrefix)) {
                throw new Error(`Plugin with the same pathPrefix already exists: ${handlerConfig.pathPrefix}`);
            }

            if (this.validatePlugin(PluginClass)) {
                this.pluginInstanceMap.set(handlerConfig.pathPrefix, pluginInstance);
                await this.storePluginInStore(PluginClass, pluginCode);
                console.log(`Plugin ${filePath} loaded successfully from file.`);
                await this.addNewInstanceConfig(handlerConfig); // 调用 addNewInstanceConfig 并记录到 store 中
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

    async loadPlugins() {
        try {
            console.debug(`Loading plugins.`);
            let PluginClass = '';
            this.pluginInstanceMap.clear();
            const pluginTemplates = this.pluginTemplateStore.get('pluginTemplates', []);
            const pluginInstancesConfig = this.instanceStore.get('pluginInstancesConfig', []);
            for (const instance of pluginInstancesConfig) {
                const handlerConfig = instance.config;
                for (const plugin of pluginTemplates) {
                    if (plugin.name === handlerConfig.indexHandlerInterface) {
                        PluginClass = plugin.code;
                        break;
                    }
                }


                const evaluatedModule = this.evaluateModule(PluginClass);
                const pluginInstance = new evaluatedModule[handlerConfig.indexHandlerInterface]();
                await pluginInstance.init(handlerConfig);
                const description = pluginInstance.getInterfaceDescription();
                console.log(`Plugin description: ${description}`);

                if (this.pluginInstanceMap.has(handlerConfig.pathPrefix)) {
                    throw new Error(`Plugin with the same pathPrefix already exists: ${handlerConfig.pathPrefix}`);
                }

                if (this.validatePlugin(pluginInstance.constructor)) {
                    this.pluginInstanceMap.set(handlerConfig.pathPrefix, pluginInstance);
                    console.log(`Plugin ${handlerConfig.indexHandlerInterface} loaded successfully from store.`);
                } else {
                    console.warn(`Plugin ${handlerConfig.indexHandlerInterface} does not implement all methods from IndexHandlerInterface and will be ignored.`);
                }
            }
        } catch (error) {
            console.error("Failed to load plugins:", error);
            throw new Error("Failed to load plugins");
        }
    }

    async loadPluginFromUrl(url) {
        try {
            console.debug(`Loading plugin from URL: ${url}`);
            const fileName = await this.downloadPluginTemplate(url);
            const pluginTemplates = this.pluginTemplateStore.get('pluginTemplates', []);
            const plugin = pluginTemplates.find(p => p.name === fileName);
            const evaluatedModule = this.evaluateModule(plugin.code);
            const handlerConfig = {
                pathPrefix: '/yuque/',
                authToken: 'yuque-auth',
                indexHandlerInterface: 'YuqueIndexHandlerImpl'
            };
            const PluginClass = evaluatedModule[handlerConfig.indexHandlerInterface];

            // 调用加载的代码的 getInterfaceDescription 方法
            const pluginInstance = new PluginClass(handlerConfig, this.user);
            await pluginInstance.init(handlerConfig);
            const description = pluginInstance.getInterfaceDescription();
            console.log(`Plugin description: ${description}`);

            if (this.pluginInstanceMap.has(handlerConfig.pathPrefix)) {
                throw new Error(`Plugin with the same pathPrefix already exists: ${handlerConfig.pathPrefix}`);
            }

            if (this.validatePlugin(PluginClass)) {
                this.pluginInstanceMap.set(handlerConfig.pathPrefix, pluginInstance);
                console.log(`Plugin ${fileName} loaded successfully from URL.`);
            } else {
                console.warn(`Plugin ${fileName} does not implement all methods from IndexHandlerInterface and will be ignored.`);
            }
        } catch (error) {
            console.error("Failed to load plugin from URL:", error);
            throw new Error("Failed to load plugin from URL");
        }
    }

    async deletePlugin(pathPrefix) {
        console.debug(`Deleting plugin with pathPrefix: ${pathPrefix}`);
        if (this.pluginInstanceMap.has(pathPrefix)) {
            this.pluginInstanceMap.delete(pathPrefix);
            const pluginInstancesConfig = this.instanceStore.get('pluginInstancesConfig', []);
            const updatedConfig = pluginInstancesConfig.filter(instance => instance.config.pathPrefix !== pathPrefix);
            this.instanceStore.set('pluginInstancesConfig', updatedConfig);
            console.log(`Plugin with pathPrefix ${pathPrefix} deleted successfully.`);

        } else {
            throw new Error(`Plugin with pathPrefix ${pathPrefix} does not exist.`);
        }
    }

    async select(pathPrefix = '') {
        console.debug(`Selecting plugin for pathPrefix: ${pathPrefix}`);
        if (this.pluginInstanceMap.size === 0) {
            await this.loadPlugins();
        }

        // 根据 pathPrefix 选出最匹配的插件
        for (const [possiblePath, plugin] of this.pluginInstanceMap) {
            if (pathPrefix.startsWith(possiblePath)) {
                return plugin;
            }
        }

        return this.defaultHandler;
    }

    async fetchPathSuggestions(input) {
        console.debug(`Fetching path suggestions for input: ${input}`);
        const suggestions = new Set();
        for (const pluginInstance of this.pluginInstanceMap.values()) {
            const pluginSuggestions = await pluginInstance.getPossiblePath(input);
            pluginSuggestions.forEach(suggestion => suggestions.add(suggestion));
        }
        console.debug(`Path suggestions: ${Array.from(suggestions)}`);
        return Array.from(suggestions);
    }
}

export default PluginHandlerImpl;