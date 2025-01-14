import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import logger from '../utils/loggerUtils.mjs';
import { app } from 'electron';

puppeteer.use(StealthPlugin());

class ChromeService {
    constructor() {
        this.browser = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.closeTimeout = 5000; // 设置关闭超时时间为5秒
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        if (app.isPackaged) {
            this.baseDir = path.join(process.resourcesPath, '');
        } else {
            this.baseDir = __dirname;
        }

        this.chromePath = this.findChromePath(this.baseDir);

        // 确保进程退出时关闭浏览器
        process.on('exit', this.forceCloseBrowser.bind(this));
        process.on('SIGINT', this.forceCloseBrowser.bind(this));
        process.on('SIGTERM', this.forceCloseBrowser.bind(this));
        process.on('uncaughtException', this.forceCloseBrowser.bind(this));
    }

    findChromePath(baseDir) {
        const platform = os.platform();
        const possibleBasePaths = [
            path.join(baseDir, 'chrome'),
            path.join(baseDir, '..', 'chrome'),
            path.join(baseDir, '..', '..', 'chrome'),
            path.join(process.cwd(), 'chrome'),
        ];

        const platformPaths = {
            darwin: ['mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
            win32: ['win', 'chrome.exe'],
        };

        const platformSubPath = platformPaths[platform];
        if (!platformSubPath) {
            logger.warn(`[ChromeService] 不支持的操作系统平台: ${platform}`);
            return null;
        }

        for (const basePath of possibleBasePaths) {
            const fullPath = path.join(basePath, ...platformSubPath);
            logger.info(`[ChromeService] 尝试查找 Chrome 路径: ${fullPath}`);
            if (fs.existsSync(fullPath)) {
                logger.info(`[ChromeService] 找到 Chrome 路径: ${fullPath}`);
                return fullPath;
            }
            logger.debug(`[ChromeService] Chrome 路径不存在: ${fullPath}`);
        }

        logger.warn('[ChromeService] 未找到本地 Chrome，将使用系统默认 Chrome');
        return null;
    }

    async checkBrowserConnection() {
        if (!this.browser) return false;

        try {
            // 尝试执行一个简单的操作来验证连接
            await this.browser.version();
            return true;
        } catch (error) {
            logger.warn('[ChromeService] 浏览器连接检查失败:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async getBrowser(userOptions = {}) {
        try {
            // 检查现有浏览器实例是否可用
            if (this.browser && await this.checkBrowserConnection()) {
                return this.browser;
            }

            // 如果浏览器实例存在但连接失败，先清理
            if (this.browser) {
                try {
                    await this.closeBrowser();
                } catch (error) {
                    logger.warn('[ChromeService] 清理旧浏览器实例时出错:', error.message);
                }
            }

            const defaultOptions = {
                ignoreDefaultArgs: false,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ],
                waitForInitialPage: true,
                pipe: true  // 使用管道而不是 WebSocket 连接
            };

            if (this.chromePath && fs.existsSync(this.chromePath)) {
                defaultOptions.executablePath = this.chromePath;
            }

            const options = { ...defaultOptions, ...userOptions };
            this.browser = await puppeteer.launch(options);
            this.isConnected = true;

            // 监听浏览器事件
            this.browser.on('disconnected', async () => {
                logger.warn('[ChromeService] 浏览器已断开连接');
                this.isConnected = false;
                this.browser = null;

                // 尝试重新连接
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    logger.info(`[ChromeService] 尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    await this.getBrowser(userOptions);
                }
            });

            this.reconnectAttempts = 0; // 重置重连计数
            logger.info('[ChromeService] 成功启动浏览器');
            return this.browser;
        } catch (error) {
            this.isConnected = false;
            logger.error('[ChromeService] 启动浏览器失败:', error);
            throw new Error(`启动浏览器失败: ${error.message}`);
        }
    }

    async closeBrowser() {
        if (this.browser) {
            try {
                // 设置关闭超时
                const closePromise = new Promise(async (resolve, reject) => {
                    try {
                        if (await this.checkBrowserConnection()) {
                            await this.browser.close();
                        }
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                });

                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('关闭浏览器超时')), this.closeTimeout);
                });

                await Promise.race([closePromise, timeoutPromise]).catch(async (error) => {
                    logger.error('[ChromeService] 正常关闭浏览器失败，尝试强制关闭:', error.message);
                    await this.forceCloseBrowser();
                });
            } catch (error) {
                logger.error('[ChromeService] 关闭浏览器时出错:', error.message);
                await this.forceCloseBrowser();
            } finally {
                this.browser = null;
                this.isConnected = false;
                this.reconnectAttempts = 0;
                logger.info('[ChromeService] 浏览器已关闭');
            }
        }
    }

    async forceCloseBrowser() {
        if (this.browser) {
            try {
                // 获取浏览器进程ID
                const browserProcess = this.browser.process();
                if (browserProcess) {
                    // 在 Windows 上使用 taskkill，在其他平台使用 kill
                    if (process.platform === 'win32') {
                        require('child_process').execSync(`taskkill /pid ${browserProcess.pid} /T /F`);
                    } else {
                        process.kill(browserProcess.pid);
                    }
                    logger.info('[ChromeService] 已强制终止浏览器进程');
                }
            } catch (error) {
                logger.error('[ChromeService] 强制关闭浏览器失败:', error.message);
            } finally {
                this.browser = null;
                this.isConnected = false;
                this.reconnectAttempts = 0;
            }
        }
    }

    static getPuppeteer() {
        return puppeteer;
    }
}

export default new ChromeService();
