import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PuppeteerIndexHandler } from './puppeteerIndexHandler.mjs';


puppeteer.use(StealthPlugin());

export class BaiduPuppeteerIndexHandlerImpl extends PuppeteerIndexHandler {
    constructor() {
        super();
    }

    async init(globalContext, handlerConfig) {
        await super.init(globalContext, handlerConfig);
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
    }

    async processSearchResults(page) {
        return await page.$$eval('#content_left > div', blocks => {
            return blocks.map(block => {
                const adElement = block.querySelector('span.ec-tuiguang');
                const isAd = adElement !== null;
                const anchor = block.querySelector('h3 a');
                if (!anchor) return null;
                const title = anchor.textContent.trim();
                const url = anchor.href;
                const spans = Array.from(block.querySelectorAll('span'));
                const descriptionElement = spans.find(span => span.className.startsWith('content-right'));
                const description = descriptionElement ? descriptionElement.innerHTML.trim() : '';
                const dateElement = block.querySelector('span.c-color-gray2');
                const date = dateElement ? dateElement.textContent.trim() : '';
                return { title, description, url, date, isAd };
            }).filter(result => result !== null);
        });
    }

    async retryOperation(operation, maxRetries = 3, delayMs = 1000) {
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
        throw lastError;
    }

    async navigateToPage(page, url, waitForSelector) {
        if (!page) {
            throw new Error('Page object is null or undefined');
        }

        return this.retryOperation(async () => {
            try {
                const browserTimeout = await this.globalContext.configHandler.getBrowserTimeout();

                const response = await page.goto(url, {
                    timeout: browserTimeout * 1000,
                    waitUntil: 'networkidle0'
                });

                if (!response || !response.ok()) {
                    throw new Error(`Navigation failed: ${response ? response.status() : 'no response'}`);
                }

                if (waitForSelector) {
                    await page.waitForSelector(waitForSelector, {
                        timeout: browserTimeout * 1000
                    });
                }

                console.info(`成功导航到页面: ${url} 并等待元素: ${waitForSelector}`);
            } catch (error) {
                // 如果导航失败，确保页面处于可用状态
                try {
                    await page.reload({ waitUntil: 'networkidle0' });
                } catch (reloadError) {
                    console.error('页面重载失败:', reloadError);
                    throw error; // 抛出原始错误
                }
                throw error;
            }
        });
    }

    async search(query, pathPrefix = '', recordDescription = true) {
        console.info("开始处理任务");
        let browser = null;
        let page = null;

        try {
            const configHandler = this.globalContext.configHandler;
            const headless = await configHandler.getHeadless();
            const browserTimeout = await configHandler.getBrowserTimeout();
            const searchItemNumbers = await configHandler.getSearchItemNumbers();

            browser = await puppeteer.launch(await this.getBrowserConfig(headless));
            page = await browser.newPage();

            // 设置页面错误处理
            page.on('error', err => {
                console.error('页面崩溃:', err);
            });

            page.on('pageerror', err => {
                console.error('页面JavaScript错误:', err);
            });

            await this.configurePageSettings(page);

            // 修改后的调用方式
            await this.navigateToPage(page, 'https://www.baidu.com', 'input[name="wd"]');
            await page.type('input[name="wd"]', query);
            await page.keyboard.press('Enter');
            await page.waitForSelector('h3', { timeout: browserTimeout * 1000 });

            const results = [];
            let totalResults = 0;

            while (totalResults < searchItemNumbers) {
                const pageResults = await this.processSearchResults(page);
                const filteredResults = pageResults.filter(result => !result.isAd);
                results.push(...filteredResults);
                totalResults += filteredResults.length;

                if (totalResults >= searchItemNumbers) break;

                const nextPageSelector = 'a.n';
                const nextPageExists = await page.$(nextPageSelector);
                if (!nextPageExists) break;

                await page.click(nextPageSelector);
                const randomWaitTime = Math.floor(Math.random() * 500) + 500;
                await new Promise(resolve => setTimeout(resolve, randomWaitTime));
                await page.waitForSelector('h3', { timeout: browserTimeout * 1000 });
            }

            const outputContent = results.slice(0, searchItemNumbers).map(result => {
                if (recordDescription && result.description) {
                    result.description = result.description.replace(/(播报|暂停|||爱企查|\n)/g, '');
                }
                return result;
            });

            console.info("任务处理完成 , 结果数量:", outputContent.length);
            return outputContent;
        } catch (error) {
            console.error("处理任务时出错:", error);
            throw error;
        } finally {
            try {
                if (page && !page.isClosed()) {
                    await page.close();
                }
                if (browser) {
                    await browser.close();
                }
            } catch (closeError) {
                console.error("关闭资源时出错:", closeError);
            }
        }
    }

    async hoverAndClick(page, selector, text) {
        try {
            await page.evaluate((selector, text) => {
                const elements = [...document.querySelectorAll(selector)];
                const element = elements.find(el => el.textContent.includes(text));
                if (element) element.click();
            }, selector, text);
        } catch (error) {
            console.error(`Error in hoverAndClick: ${error}`);
        }
    }

    async getAllPossiblePath() {
        // 返回百度搜索的根路径
        return ['/baidu.com/'];
    }

    getHandlerName() {
        return '百度';
    }

    getHandlerCategory() {
        return '搜索引擎';
    }

    getBeginPath() {
        return '/baidu.com/';
    }

    getInterfaceDescription() {
        return '百度搜索引擎支持下的问题检索回答引擎，你的问题会直接通过百度搜索引擎找到相关文档以后再依托文档回答问题。';
    }
}

export default BaiduPuppeteerIndexHandlerImpl;
