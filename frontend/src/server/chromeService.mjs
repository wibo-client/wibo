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
        this.closeTimeout = 5000; // 设置关闭超时时间为5秒
        this.activePages = new Set();
        this.idleTimeout = 5 * 60 * 1000; // 5分钟无活动后关闭浏览器
        this.idleTimer = null;
        this.globalContext = null;
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

    async init(globalContext) {
        this.globalContext = globalContext;
        logger.info('[ChromeService] 已初始化全局上下文');
    }

    findChromePath(baseDir) {
        const platform = os.platform();

        // 1. 首先检查本地打包的 Chrome
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

        // 2. 检查本地打包的 Chrome
        const platformSubPath = platformPaths[platform];
        if (platformSubPath) {
            for (const basePath of possibleBasePaths) {
                const fullPath = path.join(basePath, ...platformSubPath);
                if (fs.existsSync(fullPath)) {
                    logger.info(`[ChromeService] 找到本地打包 Chrome: ${fullPath}`);
                    return fullPath;
                }
            }
        }

        // 3. 查找系统安装的 Chrome
        const systemChromePaths = {
            win32: [
                path.join(process.env['ProgramFiles'], 'Google/Chrome/Application/chrome.exe'),
                path.join(process.env['ProgramFiles(x86)'], 'Google/Chrome/Application/chrome.exe'),
                path.join(process.env['LocalAppData'], 'Google/Chrome/Application/chrome.exe'),
            ],
            darwin: [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
            ]
        };

        const possiblePaths = systemChromePaths[platform] || [];
        for (const chromePath of possiblePaths) {
            if (fs.existsSync(chromePath)) {
                logger.info(`[ChromeService] 找到系统 Chrome: ${chromePath}`);
                return chromePath;
            }
        }

        // 4. 如果都找不到，返回 null，让 Puppeteer 使用默认的 Chrome
        logger.warn('[ChromeService] 未找到 Chrome，将使用 Puppeteer 默认的 Chrome');
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
            return false;
        }
    }

    async getBrowserConfig(additionalOptions = {}) {
        let headless = false; // 默认值
        if (this.globalContext?.configHandler) {
            try {
                headless = await this.globalContext.configHandler.getHeadless();
            } catch (error) {
                logger.warn('[ChromeService] 获取 headless 配置失败，使用默认值:', error.message);
            }
        }

        const defaultConfig = {
            headless: headless,
            args: [
                '--window-size=833x731',
                '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
                '--disable-features=BlockThirdPartyCookies',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
            waitForInitialPage: true,
            pipe: true
        };

        if (this.chromePath && fs.existsSync(this.chromePath)) {
            defaultConfig.executablePath = this.chromePath;
        }

        return { ...defaultConfig, ...additionalOptions };
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

            const options = await this.getBrowserConfig(userOptions);
            this.browser = await puppeteer.launch(options);

            logger.info('[ChromeService] 成功启动浏览器');
            return this.browser;
        } catch (error) {
            logger.error('[ChromeService] 启动浏览器失败:', error);
            throw new Error(`启动浏览器失败: ${error.message}`);
        }
    }

    async createPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        this.activePages.add(page);
        this.resetIdleTimer();
        return page;
    }

    async closePage(page) {
        if (page && !page.isClosed()) {
            await page.close();
            this.activePages.delete(page);

            // 当没有活动页面时，启动空闲计时器
            if (this.activePages.size === 0) {
                this.startIdleTimer();
            }
        }
    }

    resetIdleTimer() {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = null;
        }
    }

    startIdleTimer() {
        this.resetIdleTimer();
        this.idleTimer = setTimeout(async () => {
            if (this.activePages.size === 0) {
                logger.info('[ChromeService] 浏览器空闲超时，正在关闭...');
                await this.closeBrowser();
            }
        }, this.idleTimeout);
    }

    getActivePageCount() {
        return this.activePages.size;
    }

    async closeBrowser() {
        if (this.browser) {
            // Close all active pages first
            for (const page of this.activePages) {
                await this.closePage(page);
            }
            this.activePages.clear();

            // Only close browser if explicitly requested
            try {
                await this.browser.close();
                this.browser = null;
                logger.info('[ChromeService] 浏览器已关闭');
            } catch (error) {
                logger.error('[ChromeService] 关闭浏览器时出错:', error.message);
                await this.forceCloseBrowser();
            } finally {
                this.browser = null;
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
            }
        }
    }

    static getPuppeteer() {
        return puppeteer;
    }
}

export default new ChromeService();
