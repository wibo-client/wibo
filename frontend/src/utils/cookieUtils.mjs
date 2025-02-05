import path from 'path';
import fs from 'fs';
import logger from './loggerUtils.mjs';
import { app } from 'electron';

export class CookieUtils {
    constructor() {
        this.userDataDir = path.join(app.getPath('userData'), 'cookies');
        if (!fs.existsSync(this.userDataDir)) {
            fs.mkdirSync(this.userDataDir, { recursive: true });
        }
        logger.debug(`CookieUtils: 使用数据目录: ${this.userDataDir}`);
    }

    async loadCookies(page, siteName) {
        const cookiesFilePath = path.join(this.userDataDir, siteName, 'cookies.json');
        if (fs.existsSync(cookiesFilePath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesFilePath));
            await page.setCookie(...cookies);
        }
    }

    async saveCookies(page, siteName) {
        try {
            const cookiesFilePath = path.join(this.userDataDir, siteName, 'cookies.json');
            const cookiesDir = path.dirname(cookiesFilePath);
            
            if (!fs.existsSync(cookiesDir)) {
                fs.mkdirSync(cookiesDir, { recursive: true });
            }
            
            const cookies = await page.cookies();
            logger.info(`获取到 ${cookies.length} 个 cookies`);
            
            fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies, null, 2));
        } catch (error) {
            logger.error(`保存 cookies 时出错: ${error.message}`);
        }
    }

    async getCookies(siteName) {
        const cookiesFilePath = path.join(this.userDataDir, siteName, 'cookies.json');
        if (fs.existsSync(cookiesFilePath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesFilePath));
            return cookies;
        }
        return [];
    }
}

export default CookieUtils;
