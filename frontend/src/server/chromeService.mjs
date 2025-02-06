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

        // 确保总是有一个有效的基础路径
        this.baseDir = '';
        if (app && app.isPackaged) {
            this.baseDir = process.resourcesPath || path.join(__dirname, '..', '..');
        } else {
            this.baseDir = path.resolve(__dirname, '..', '..');
        }

        // 确保 baseDir 存在后再查找 Chrome
        if (!fs.existsSync(this.baseDir)) {
            this.baseDir = process.cwd();
        }

        this.chromePath = this.findChromePath(this.baseDir);
        console.info('[ChromeService] 完成chrome初始化');
    }

    async init(globalContext) {
        this.globalContext = globalContext;
        logger.info('[ChromeService] 已初始化全局上下文');

        // 确保进程退出时关闭浏览器
        process.on('exit', this.forceCloseBrowser.bind(this));
        process.on('SIGINT', this.forceCloseBrowser.bind(this));
        process.on('SIGTERM', this.forceCloseBrowser.bind(this));
    }

    findChromePath(baseDir) {
        // 确保基础路径有效
        if (!baseDir || typeof baseDir !== 'string') {
            logger.warn('[ChromeService] baseDir 无效，使用当前工作目录');
            baseDir = process.cwd();
        }

        const resolvedBaseDir = path.resolve(baseDir);
        logger.info(`[ChromeService] 使用基础路径: ${resolvedBaseDir}`);

        const platform = os.platform();
        
        // 安全地构建基础路径数组
        const possibleBasePaths = [
            resolvedBaseDir,
            path.join(resolvedBaseDir, 'chrome'),
            path.join(resolvedBaseDir, 'dist', 'chrome'),
            path.join(resolvedBaseDir, '..', 'chrome')
        ].filter(p => fs.existsSync(p));

        // 安全地获取环境变量
        const getProgramPath = (envVar) => {
            const value = process.env[envVar];
            return value ? path.join(value, 'Google/Chrome/Application/chrome.exe') : null;
        };

        const systemChromePaths = {
            win32: [
                getProgramPath('ProgramFiles'),
                getProgramPath('ProgramFiles(x86)'),
                getProgramPath('LocalAppData')
            ].filter(Boolean),
            darwin: [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
            ]
        };

        // 查找本地打包的 Chrome
        const platformSubPath = {
            darwin: ['mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
            win32: ['win', 'chrome.exe']
        }[platform];

        if (platformSubPath) {
            for (const basePath of possibleBasePaths) {
                try {
                    const fullPath = path.join(basePath, ...platformSubPath);
                    if (fs.existsSync(fullPath)) {
                        logger.info(`[ChromeService] 找到本地打包 Chrome: ${fullPath}`);
                        return fullPath;
                    }
                } catch (error) {
                    logger.warn(`[ChromeService] 检查路径失败: ${basePath}`, error.message);
                    continue;
                }
            }
        }

        // 查找系统 Chrome
        const possiblePaths = systemChromePaths[platform] || [];
        for (const chromePath of possiblePaths) {
            try {
                if (fs.existsSync(chromePath)) {
                    logger.info(`[ChromeService] 找到系统 Chrome: ${chromePath}`);
                    return chromePath;
                }
            } catch (error) {
                logger.warn(`[ChromeService] 检查系统 Chrome 路径失败: ${chromePath}`, error.message);
                continue;
            }
        }

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
            throw new Error(`启动浏览器失败 : 请确认你的电脑安装了chrome浏览器的较新版本。 : ${error.message}`);
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
