import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import BaiduPuppeteerIndexHandlerImpl from './baiduPuppeteerIndexHandlerImpl.mjs';
import https from 'https';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import Store from 'electron-store';

export class PluginHandlerImpl {
    constructor() {
        this.pluginInstanceMap = new Map();
        this.mktplaceUrl = 'localhost:8080';
        this.defaultHandler = new BaiduPuppeteerIndexHandlerImpl();
        this.store = new Store({ name: 'pluginTemplates' });
        this.instanceStore = new Store({ name: 'pluginInstancesConfig' });
        // this.store.clear();
        // this.instanceStore.clear();
    }

    async storePluginInStore(pluginClass, content) {
        const name = pluginClass.name;
        const pluginTemplates = this.store.get('pluginTemplates', []);
        const existingPlugin = pluginTemplates.find(plugin => plugin.name === name);
        if (existingPlugin) {
            console.log(`Plugin with name ${name} already exists.`);
        }
        pluginTemplates.push({ name, code: content });
        this.store.set('pluginTemplates', pluginTemplates);
    }

    async storeInstanceConfigInStore(name, config) {
        const pluginInstancesConfig = this.instanceStore.get('pluginInstancesConfig', []);
        const existingInstance = pluginInstancesConfig.find(instance => instance.name === name);
        if (existingInstance) {
            console.log(`Instance config with name ${name} already exists.`);
        }
        pluginInstancesConfig.push({ name, config });
        this.instanceStore.set('pluginInstancesConfig', pluginInstancesConfig);
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
            const pluginCode = await fs.promises.readFile(filePath, 'utf-8');
            const configFilePath = filePath.replace(/\.js$/, '.json');
            const handlerConfig = JSON.parse(await fs.promises.readFile(configFilePath, 'utf-8'));
            const evaluatedModule = this.evaluateModule(pluginCode);
            
            const PluginClass = evaluatedModule[handlerConfig.indexHandlerInterface];

            // 调用加载的代码的 getInterfaceDescription 方法
            const pluginInstance = new PluginClass();
            await pluginInstance.loadConfig(handlerConfig);
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
            let PluginClass = '';
            this.pluginInstanceMap.clear();
            const pluginTemplates = this.store.get('pluginTemplates', []);
            const pluginInstancesConfig = this.instanceStore.get('pluginInstancesConfig', []);
            for (const instance of pluginInstancesConfig) {
                const handlerConfig = instance.config;
               for(const plugin of pluginTemplates) {
                    if (plugin.name === handlerConfig.indexHandlerInterface) {
                        PluginClass = plugin.code;
                        break;
                    }
                }

        
                const evaluatedModule = this.evaluateModule(PluginClass);
                const pluginInstance = new evaluatedModule[handlerConfig.indexHandlerInterface]();
                await pluginInstance.loadConfig(handlerConfig);
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
            const fileName = await this.downloadPluginTemplate(url);
            const pluginTemplates = this.store.get('pluginTemplates', []);
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
            await pluginInstance.loadConfig(handlerConfig);
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

    async select(pathPrefix = '') {
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
}

export default PluginHandlerImpl;