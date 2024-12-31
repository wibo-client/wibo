import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PuppeteerIndexHandler } from './puppeteerIndexHandler.mjs';
import ConfigKeys from '../../config/configKeys.mjs';

puppeteer.use(StealthPlugin());

export class BaiduPuppeteerIndexHandlerImpl extends PuppeteerIndexHandler {
    constructor() {
        super();
    }

    async init(globalContext, handlerConfig) {
        await super.init(globalContext, handlerConfig);
        this.globalConfig = globalContext.globalConfig;
        this.browserTimeout = this.globalConfig.browserTimeout || 30;
        this.searchItemNumbers = this.globalConfig.searchItemNumbers || 20;
    }

    async search(query, pathPrefix = '', recordDescription = true) {
        console.info("开始处理任务");

        let browser;
        try {
            browser = await puppeteer.launch({
                headless: false,
                args: [
                    '--window-size=833x731',
                    '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
                    '--disable-features=BlockThirdPartyCookies',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });

            const page = await browser.newPage();
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

            await page.goto('https://www.baidu.com');
            const inputSelector = 'input[name="wd"]';
            await page.waitForSelector(inputSelector);
            await page.type(inputSelector, query);
            await page.keyboard.press('Enter');
            await page.waitForSelector('h3', { timeout: this.browserTimeout * 1000 });

            const results = [];
            let totalResults = 0;

            while (totalResults < this.searchItemNumbers) {
                const pageResults = await page.$$eval('#content_left > div', blocks => {
                    return blocks.map(block => {
                        const adElement = block.querySelector('span.ec-tuiguang');
                        const isAd = adElement !== null;
                        const anchor = block.querySelector('h3 a');
                        if (!anchor) return null;
                        const title = anchor.textContent.trim();
                        const url = anchor.href;
                        const descriptionElement = block.querySelector('div.c-gap-top-small');
                        const description = descriptionElement ? descriptionElement.textContent.trim() : '';
                        const dateElement = block.querySelector('span.c-color-gray2');
                        const date = dateElement ? dateElement.textContent.trim() : '';

                        return { title, description, url, date, isAd };
                    }).filter(result => result !== null);
                });

                const filteredResults = pageResults.filter(result => !result.isAd);

                results.push(...filteredResults);
                totalResults += filteredResults.length;

                if (totalResults >= this.searchItemNumbers) {
                    break;
                }

                const nextPageSelector = 'a.n';
                const nextPageExists = await page.$(nextPageSelector);
                if (nextPageExists) {
                    await page.click(nextPageSelector);
                    const randomWaitTime = Math.floor(Math.random() * 500) + 500;
                    await new Promise(resolve => setTimeout(resolve, randomWaitTime));
                    await page.waitForSelector('h3', { timeout: this.browserTimeout * 1000 });
                } else {
                    break;
                }
            }

            const outputContent = results.slice(0, this.searchItemNumbers).map(result => {
                if (recordDescription) {
                    if (result.description) {
                        result.description = result.description.replace(/(播报|暂停|||爱企查|\n)/g, '');
                    }
                }
                return result;
            });
            console.info("任务处理完成 , 结果数量:", outputContent.length);
            return outputContent;
        } catch (error) {
            console.error("处理任务时出错:", error);
            throw error;
        } finally {
            if (browser) {
                await browser.close();
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

    getHandlerName() {
        return 'BaiduPuppeteerIndexHandlerImpl';
    }
}

export default BaiduPuppeteerIndexHandlerImpl;
