import { IndexHandlerInterface } from './indexHandlerInter.mjs';
import BaiduPuppeteerIndexHandlerImpl from './baiduPuppeteerIndexHandlerImpl.mjs';
import Store from 'electron-store';
import https from 'https';
import fs from 'fs';
import path from 'path';

export class PluginHandlerImpl {
    constructor() {
        this.plugins = [];
        this.mktplaceUrl = 'localhost:8080';
        this.defaultHandler = new BaiduPuppeteerIndexHandlerImpl();
        this.store = new Store({ name: 'plugins' });
    }

    async loadPlugins() {
        try {
            const plugins = this.store.get('plugins', []);
            for (const plugin of plugins) {
                const blob = new Blob([plugin.code], { type: 'application/javascript' });
                const url = URL.createObjectURL(blob);
                const { default: PluginClass } = await import(url);
                if (PluginClass.prototype instanceof IndexHandlerInterface) {
                    const pluginInstance = new PluginClass(this.handlerConfig);
                    this.plugins.push(pluginInstance);
                } else {
                    console.warn(`Plugin ${plugin.name} does not extend IndexHandlerInterface and will be ignored.`);
                }
            }
        } catch (error) {
            console.error("Failed to load plugins:", error);
            throw new Error("Failed to load plugins");
        }
    }

    async downloadPlugin(url) {
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

                response.on('end', () => {
                    this.storePluginInStore(fileName, data)
                        .then(() => resolve(fileName))
                        .catch(reject);
                });
            }).on('error', (err) => {
                reject(err);
            });
        });
    }

    async storePluginInStore(name, content) {
    
        this.store.set('plugins', []);
        const plugins = this.store.get('plugins', []);
        plugins.push({ name, code: content });
        this.store.set('plugins', plugins);
    }

    async loadPluginFromUrl(url) {
        try {
            const fileName = await this.downloadPlugin(url);
            const plugins = this.store.get('plugins', []);
            const plugin = plugins.find(p => p.name === fileName);
            const { default: PluginClass } = await import(URL.createObjectURL(new Blob([plugin.code], { type: 'application/javascript' })));
            if (PluginClass.prototype instanceof IndexHandlerInterface) {
                const pluginInstance = new PluginClass(this.handlerConfig);
                this.plugins.push(pluginInstance);
                console.log(`Plugin ${fileName} loaded successfully.`);
            } else {
                console.warn(`Plugin ${fileName} does not extend IndexHandlerInterface and will be ignored.`);
            }
        } catch (error) {
            console.error("Failed to load plugin from URL:", error);
            throw new Error("Failed to load plugin from URL");
        }
    }

    async addPluginFromFile(filePath) {
        try {
            const pluginCode = await fs.promises.readFile(filePath, 'utf-8');
            const fileName = path.basename(filePath);
            await this.storePluginInStore(fileName, pluginCode);
            console.info(`Plugin ${fileName} added successfully.`);
            
            const { default: PluginClass } = await import(URL.createObjectURL(new Blob([pluginCode], { type: 'application/javascript' })));
            if (PluginClass.prototype instanceof IndexHandlerInterface) {
                const pluginInstance = new PluginClass(this.handlerConfig);
                this.plugins.push(pluginInstance);
                console.log(`Plugin ${fileName} loaded successfully from file.`);
            } else {
                console.warn(`Plugin ${fileName} does not extend IndexHandlerInterface and will be ignored.`);
            }
        } catch (error) {
            console.error("Failed to add plugin from file:", error);
            throw new Error("Failed to add plugin from file");
        }
    }

    async select(pathPrefix = '') {
        if (this.plugins.length === 0) {
            await this.loadPlugins();
        }

        // 根据 pathPrefix 选出最匹配的插件
        const plugin = this.plugins.find(plugin => pathPrefix.startsWith(plugin.handlerConfig.pathPrefix));
        if (!plugin) {
            return this.defaultHandler;
        }

        return plugin;
    }
}

export default PluginHandlerImpl;