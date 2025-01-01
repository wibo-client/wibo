import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PuppeteerIndexHandler } from '../component/indexHandler/puppeteerIndexHandler.mjs';
import ConfigKeys from '../config/configKeys.mjs';
import path from 'path';
import CookieUtils from '../utils/cookieUtils.mjs';

puppeteer.use(StealthPlugin());

export class CmbchinawmPuppeteerIndexHandlerImpl extends PuppeteerIndexHandler {
    constructor() {
        super();
        this.loginCallback = null;
        this.cookieUtils = new CookieUtils(this.userDataDir);
    }
    
    async init(globalContext, handlerConfig) {
        await super.init(globalContext, handlerConfig);
        this.globalConfig = globalContext.globalConfig;
        this.browserTimeout = this.globalConfig.browserTimeout || 30;
        this.searchItemNumbers = this.globalConfig.searchItemNumbers || 20;
        this.userDataDir = path.resolve(this.globalConfig.userDataDir || './user_data');
        this.cookieUtils = new CookieUtils(this.userDataDir);
    }

    async search(query, pathPrefix = '', recordDescription = true) {
        console.info("开始处理任务");
        const headless = this.globalConfig[ConfigKeys.HEADLESS] !== undefined ? this.globalConfig[ConfigKeys.HEADLESS] === 'true' : false;
        let browser;
        try {
            browser = await puppeteer.launch({
               headless: headless,
               userDataDir: this.userDataDir,
               args: [
                    '--window-size=833x731',
                    '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
                    '--disable-features=BlockThirdPartyCookies',
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });

            const page = await browser.newPage();

            const url = `https://www.cmbchinawm.com/publicOffering`;
            const siteName = new URL(url).hostname
            // 加载 cookies
            await this.cookieUtils.loadCookies(page, siteName);

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
            await page.goto(url);
           
            const inputSelector = '.el-input__inner';
            await page.waitForSelector(inputSelector);
            await page.type(inputSelector, query);
            await page.keyboard.press('Enter');
            await page.waitForSelector('.list-item.padding-sm', { timeout: this.browserTimeout * 1000 });

            const results = [];
            let totalResults = 0;

            while (totalResults < this.searchItemNumbers) {
                const items = await page.$$('.list-item.padding-sm');
                for (const item of items) {
                    const titleElement = await item.$('.product-title');
                    const title = titleElement ? await (await titleElement.getProperty('textContent')).jsonValue() : '';
                    const description = await (await item.getProperty('innerText')).jsonValue();
                    const cleanedDescription = description.replace(title, '').trim();

                    const moreButton = await item.$('.more');
                    let url = '';
                    if (moreButton) {
                        await moreButton.hover();
                        await moreButton.click();

                        const newPagePromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));
                        const newPage = await newPagePromise;
                        
                        await newPage.waitForSelector('body', { timeout: this.browserTimeout * 1000 });


                        url = newPage.url();
                        await newPage.close();
                    }

                    results.push({ title, description: cleanedDescription, url });
                    totalResults += 1;

                    if (totalResults >= this.searchItemNumbers) {
                        break;
                    }
                }

                if (totalResults >= this.searchItemNumbers) {
                    break;
                }

                const nextPageSelector = 'a.next-page';
                const nextPageExists = await page.$(nextPageSelector);
                if (nextPageExists) {
                    await page.click(nextPageSelector);
                    const randomWaitTime = Math.floor(Math.random() * 500) + 500;
                    await new Promise(resolve => setTimeout(resolve, randomWaitTime));
                    await page.waitForSelector('.list-item.padding-sm', { timeout: this.browserTimeout * 1000 });
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

            // 保存 cookies
            await this.cookieUtils.saveCookies(page, siteName);

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

    async handleLogin(page) {
        console.info("检测到登录对话框，开始处理登录...");
        if (this.loginCallback) {
            await this.loginCallback(page);
        } else {
            // 在这里添加处理登录的逻辑，例如输入用户名和密码，点击登录按钮等
            const loginSelector = '#app > div:nth-child(1) > div > div.login-container';
            await page.waitForSelector(loginSelector, { timeout: 300000 }); // 延迟增加到5分钟
            // 例如：
            // await page.type('#username', 'your-username');
            // await page.type('#password', 'your-password');
            // await page.click('#login-button');
            // 等待登录完成
            const maxWaitTime = 10 * 60 * 1000; // 10分钟
            const interval = 5000; // 5秒
            let loggedIn = false;
            let totalWaitTime = 0;

            while (!loggedIn && totalWaitTime < maxWaitTime) {
                try {
                    await page.waitForNavigation({ timeout: interval });
                    loggedIn = true;
                } catch (error) {
                    console.info("登录尚未完成，继续等待...");
                    totalWaitTime += interval;
                }
            }

            if (!loggedIn) {
                throw new Error("登录超时");
            }

            console.info("登录处理完成");
        }
    }

    registerLoginCallback(callback) {
        this.loginCallback = callback;
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
        return 'CmbchinawmPuppeteerIndexHandlerImpl';
    }
}

export default CmbchinawmPuppeteerIndexHandlerImpl;
