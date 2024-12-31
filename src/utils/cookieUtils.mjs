import path from 'path';
import fs from 'fs';

export class CookieUtils {
    constructor(userDataDir) {
        this.userDataDir = userDataDir;
    }

    async loadCookies(page, siteName) {
        const cookiesFilePath = path.join(this.userDataDir, siteName, 'cookies.json');
        if (fs.existsSync(cookiesFilePath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesFilePath));
            await page.setCookie(...cookies);
        }
    }

    async saveCookies(page, siteName) {
        const cookiesFilePath = path.join(this.userDataDir, siteName, 'cookies.json');
        const cookiesDir = path.dirname(cookiesFilePath);
        if (!fs.existsSync(cookiesDir)) {
            fs.mkdirSync(cookiesDir, { recursive: true });
        }
        const cookies = await page.cookies();
        fs.writeFileSync(cookiesFilePath, JSON.stringify(cookies, null, 2));
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
