import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import logger from '../utils/loggerUtils.mjs';

puppeteer.use(StealthPlugin());

class ChromeService {
    constructor() {
        this.browser = null;
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        this.chromePath = this.findChromePath(__dirname);
    }

    findChromePath(baseDir) {
        const platform = os.platform();
        const possibleBasePaths = [
            path.join(process.resourcesPath, 'chrome'),
            path.join(baseDir, '..', '..', 'chrome'),
            path.join(baseDir, '..', '..', '..', 'chrome'),
            path.join(process.cwd(), 'chrome'),
        ];

        const platformPaths = {
            darwin: ['mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
            win32: ['win', 'Google Chrome for Testing.exe'],
            linux: ['linux', 'Google Chrome for Testing']
        };

        const platformSubPath = platformPaths[platform];
        if (!platformSubPath) {
            logger.warn(`[ChromeService] 不支持的操作系统平台: ${platform}`);
            return null;
        }

        for (const basePath of possibleBasePaths) {
            const fullPath = path.join(basePath, ...platformSubPath);
            if (fs.existsSync(fullPath)) {
                logger.info(`[ChromeService] 找到 Chrome 路径: ${fullPath}`);
                return fullPath;
            }
            logger.debug(`[ChromeService] Chrome 路径不存在: ${fullPath}`);
        }

        logger.warn('[ChromeService] 未找到本地 Chrome，将使用系统默认 Chrome');
        return null;
    }

    async getBrowser(userOptions = {}) {
        if (this.browser) {
            return this.browser;
        }

        try {
            const defaultOptions = {};
            
            if (this.chromePath && fs.existsSync(this.chromePath)) {
                logger.info(`[ChromeService] 使用本地 Chrome: ${this.chromePath}`);
                defaultOptions.executablePath = this.chromePath;
            } else {
                logger.info('[ChromeService] 使用系统默认 Chrome');
            }

            const options = { ...defaultOptions, ...userOptions };
            this.browser = await puppeteer.launch(options);
            logger.info('[ChromeService] 成功启动浏览器');

            this.browser.on('disconnected', () => {
                logger.info('[ChromeService] 浏览器已断开连接');
                this.browser = null;
            });

            return this.browser;
        } catch (error) {
            logger.error(`[ChromeService] 启动浏览器失败: ${error}`);
            throw error;
        }
    }

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            logger.info('[ChromeService] 浏览器已关闭');
        }
    }

    static getPuppeteer() {
        return puppeteer;
    }
}

export default new ChromeService();
