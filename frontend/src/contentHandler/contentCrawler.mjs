import ChromeService from '../server/chromeService.mjs';
import CookieUtils from '../utils/cookieUtils.mjs';
import path from 'path';

export class ContentCrawler {
    constructor() {
        this.activeRequests = 0;
        this.requestQueue = [];
    }

    async init(globalContext) {
        this.globalContext = globalContext;
    }

    async getBrowserConfig(headless) {
        return {
            headless: headless,
            args: [
                '--window-size=833x731',
                '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
                '--disable-features=BlockThirdPartyCookies',
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ]
        };
    }

    async configurePageSettings(page) {
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36');
        await page.setExtraHTTPHeaders({
            'sec-ch-ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"macOS"',
            'sec-fetch-dest': 'image',
            'sec-fetch-mode': 'no-cors',
            'sec-fetch-site': 'same-site',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        });
        page.setDefaultNavigationTimeout(60000);
    }

    async retryOperation(operation, maxRetries = 2, delayMs = 1000) {
        let lastError;
        let attempt = 0;
        while (attempt < maxRetries) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                console.warn(`重试操作失败 (${attempt + 1}/${maxRetries}):`, error.message);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
                attempt++;
            }
        }
        return ''; // 超时返回空的结果
    }

    async fetchPageContent(url) {
        const configHandler = this.globalContext.configHandler;
        const userDataDirString = await configHandler.getUserDataDir();
        const browserConcurrency = await configHandler.getBrowserConcurrency();
        const userDataDir = path.resolve(userDataDirString || './user_data');
        const cookieUtils = new CookieUtils(userDataDir);
        const headless = await this.globalContext.configHandler.getHeadless();

        // 等待队列中的请求
        await this.waitForAvailableSlot(browserConcurrency);

        let page = null;
        try {
            this.activeRequests++;
            const browserConfig = await this.getBrowserConfig(headless);
            const browser = await ChromeService.getBrowser(browserConfig);
            page = await browser.newPage();

            await this.configurePageSettings(page);
            await cookieUtils.loadCookies(page, new URL(url).hostname);

            const content = await this.retryOperation(async () => {
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
                await page.waitForSelector('body', { timeout: 30000 });
                const pageContent = await page.evaluate(() => document.body.innerText);
                await cookieUtils.saveCookies(page, new URL(url).hostname);
                return this.convertToMarkdown(pageContent);
            });

            return content;
        } catch (error) {
            console.error("处理任务时出错:", error);
            return '';
        } finally {
            if (page && !page.isClosed()) {
                await page.close();
            }
            await ChromeService.closeBrowser();
            this.activeRequests--;
            this.processQueue();
        }
    }

    async waitForAvailableSlot(browserConcurrency) {
        if (this.activeRequests < browserConcurrency) {
            return;
        }
        return new Promise(resolve => {
            this.requestQueue.push(resolve);
        });
    }

    processQueue() {
        if (this.requestQueue.length > 0 && this.activeRequests < this.globalContext.configHandler.getBrowserConcurrency()) {
            const resolve = this.requestQueue.shift();
            resolve();
        }
    }

    convertToMarkdown(innerText) {
        // 示例转换逻辑，可以根据需要进行调整
        let markdownText = innerText
            .replace(/^(#+)\s+/gm, '$1 ') // 标题
            .replace(/\*\*(.*?)\*\*/g, '**$1**') // 粗体
            .replace(/\*(.*?)\*/g, '*$1*') // 斜体
            .replace(/`([^`]+)`/g, '`$1`') // 代码
            .replace(/\n/g, '\n\n'); // 换行

        return markdownText;
    }
}

export default ContentCrawler;