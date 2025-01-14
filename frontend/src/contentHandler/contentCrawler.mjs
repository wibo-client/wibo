import ChromeService from '../server/chromeService.mjs';
import CookieUtils from '../utils/cookieUtils.mjs';
import path from 'path';

// 添加 Semaphore 类实现
class Semaphore {
    constructor(max) {
        this.max = max;
        this.count = 0;
        this.queue = [];
    }

    setMax(newMax) {
        const diff = newMax - this.max;
        this.max = newMax;
        // 如果增加了可用数量，释放等待的请求
        if (diff > 0) {
            for (let i = 0; i < Math.min(diff, this.queue.length); i++) {
                const next = this.queue.shift();
                next();
            }
        }
    }

    async acquire() {
        if (this.count < this.max) {
            this.count++;
            return;
        }

        // 如果已达到最大值，则等待
        await new Promise(resolve => this.queue.push(resolve));
        this.count++;
    }

    release() {
        this.count--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        }
    }
}

export class ContentCrawler {
    constructor() {
        this.semaphore = null;
    }

    async init(globalContext) {
        this.globalContext = globalContext;
        await ChromeService.init(globalContext);
        // 初始化信号量
        const browserConcurrency = await this.globalContext.configHandler.getBrowserConcurrency();
        this.semaphore = new Semaphore(browserConcurrency);
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
        const userDataDir = path.resolve(userDataDirString || './user_data');
        const cookieUtils = new CookieUtils(userDataDir);

        // 检查并更新并发数
        const currentBrowserConcurrency = await configHandler.getBrowserConcurrency();
        if (this.semaphore.max !== currentBrowserConcurrency) {
            this.semaphore.setMax(currentBrowserConcurrency);
        }

        let page = null;
        try {
            // 获取信号量
            await this.semaphore.acquire();

            page = await ChromeService.createPage();  // 移除 headless 参数

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
                await ChromeService.closePage(page);
            }
            // 释放信号量
            this.semaphore.release();
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