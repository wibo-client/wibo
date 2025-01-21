import { PuppeteerIndexHandler } from './puppeteerIndexHandler.mjs';
import ChromeService from '../server/chromeService.mjs';

export class BaiduPuppeteerIndexHandlerImpl extends PuppeteerIndexHandler {
    constructor() {
        super();
    }

    async init(globalContext, handlerConfig) {
        await super.init(globalContext, handlerConfig);
        this.globalContext = globalContext;
        await ChromeService.init(globalContext);  // 添加这一行
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

    async rewriteQuery(query) {
        try {
            const prompt = `请将以下问题转换为多个适合百度搜索引擎的关键词组合。要求：
            1. 每个关键词组合应该突出不同的搜索角度
            2. 使用精准的专业术语和同义词扩展
            3. 考虑时效性信息（如适用）
            4. 去除口语化表达，保留核心概念
            5. 返回3-5个最相关的搜索词组合
            6. 直接返回搜索词组合，每行一组 ，无需解释

            原始问题：${query}`;

            const response = await this.globalContext.llmCaller.callSync([
                { role: 'user', content: prompt }
            ]);

            if (!response || !response[0]) {
                console.warn('LLM 响应为空，使用原始查询');
                return [{ query, queryLog: `计划执行 ${query}` }];
            }

            const queries = response[0]
                .split('\n')
                .map(q => q.trim())
                .filter(q => q && q.length > 0);

            if (queries.length === 0) {
                console.warn('未生成有效查询，使用原始查询');
                return [{ query, queryLog: `计划执行 ${query}` }];
            }

            const queriesWithLogs = [
                { query, queryLog: `计划执行 ${query}` },
                ...queries.map(q => ({
                    query: q,
                    queryLog: `计划执行 ${q}`
                }))
            ];

            console.log('生成的查询词组：', queriesWithLogs);
            return queriesWithLogs;

        } catch (error) {
            console.error('查询重写失败:', error);
            return [{ query, queryLog: `计划执行 ${query}` }];
        }
    }

    async rerank(documentPartList, queryString) {
        if (!Array.isArray(documentPartList) || typeof queryString !== 'string') {
            throw new TypeError('Invalid input types for rerank method');
        }
        return await this.globalContext.rerankImpl.rerank(documentPartList, queryString);
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
                console.warn(`重试操作失败 (${attempt + 1}/${maxRetries}): ${error.message}`);

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
                try {
                    await page.reload({ waitUntil: 'networkidle0' });
                } catch (reloadError) {
                    console.error(`页面重载失败: ${reloadError}`);
                    throw error;
                }
                throw error;
            }
        });
    }

    async waitForSelectorWithRetry(page, selector, timeout, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                await page.waitForSelector(selector, {
                    timeout: timeout * 1000,
                    visible: true
                });
                return true;
            } catch (error) {
                lastError = error;
                console.warn(`等待选择器 ${selector} 失败 (${i + 1}/${maxRetries}): ${error.message}`);
                
                // 如果不是最后一次重试，则等待后重试
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                    try {
                        await page.reload({ waitUntil: 'networkidle0' });
                    } catch (reloadError) {
                        console.warn(`页面重载失败: ${reloadError.message}`);
                    }
                }
            }
        }
        throw lastError;
    }

    async handleNextPage(page, browserTimeout) {
        const nextPageSelector = 'a.n';
        let retryCount = 0;
        const maxRetries = 3;

        while (retryCount < maxRetries) {
            try {
                // 检查并选择包含“下一页”文本的 a.n 元素
                const nextPageExists = await page.$eval(nextPageSelector, el => el && el.textContent.includes('下一页') ? el : null);
                if (!nextPageExists) return false;

                // 等待元素可交互
                await page.waitForSelector(nextPageSelector, {
                    timeout: browserTimeout * 1000,
                    visible: true
                });

                // 点击下一页
                await Promise.all([
                    // page.waitForNavigation({ timeout: browserTimeout * 300 }),
                    page.click(nextPageSelector)
                ]);

                // 随机延迟
                await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 500));

                // 等待新页面加载完成
                await this.waitForSelectorWithRetry(page, 'h3', browserTimeout);

                return true;
            } catch (error) {
                retryCount++;
                console.warn(`翻页失败 (${retryCount}/${maxRetries}):`, error.message, error.stack);

                if (error.message.includes('Node is detached')) {
                    // 对于节点分离错误，尝试刷新页面
                    try {
                        await page.reload({ waitUntil: 'networkidle0' });
                        await page.waitForSelector('h3', {
                            timeout: browserTimeout * 1000,
                            visible: true
                        });
                    } catch (reloadError) {
                        console.error('页面刷新失败:', reloadError);
                    }
                }

                if (retryCount === maxRetries) {
                    console.error('翻页重试次数已达上限，停止翻页');
                    return false;
                }

                // 在重试前等待一段时间
                await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            }
        }
        return false;
    }

    async search(query, pathPrefix = '', recordDescription = true) {
        console.info("开始处理任务");
        let page = null;

        try {
            const configHandler = this.globalContext.configHandler;
            const browserTimeout = await configHandler.getBrowserTimeout();
            const searchItemNumbers = await configHandler.getSearchItemNumbers();
            // 移除 headless 获取

            page = await ChromeService.createPage();  // 移除 headless 参数

            page.on('error', err => {
                console.error(`页面崩溃: ${err}`);
            });

            page.on('pageerror', err => {
                console.error(`页面JavaScript错误: ${err}`);
            });

            await this.configurePageSettings(page);

            // 执行搜索操作
            await this.navigateToPage(page, 'https://www.baidu.com', 'input[name="wd"]');
            await page.type('input[name="wd"]', query);
            await page.keyboard.press('Enter');
            await this.waitForSelectorWithRetry(page, 'h3', browserTimeout);

            const results = [];
            const seenUrls = new Set();
            let totalResults = 0;

            // 搜索结果处理循环
            while (totalResults < searchItemNumbers) {
                const pageResults = await this.processSearchResults(page);
                const filteredResults = pageResults.filter(result => {
                    if (result.isAd || seenUrls.has(result.url)) return false;
                    seenUrls.add(result.url);
                    return true;
                });

                results.push(...filteredResults);
                totalResults = results.length;

                if (totalResults >= searchItemNumbers) break;

                // 使用新的翻页处理方法
                const nextPageSuccess = await this.handleNextPage(page, browserTimeout);
                if (!nextPageSuccess) break;
            }
            const outputContent = results.slice(0, searchItemNumbers).map(result => {
                if (recordDescription && result.description) {
                    result.description = result.description.replace(/(播报|暂停|||爱企查|\n)/g, '');
                }
                result.id = Math.floor(Math.random() * 100000);;
                return result;
            });

            console.info(`任务处理完成, 结果数量: ${outputContent.length}`);
            return outputContent;

        } catch (error) {
            console.error(`处理任务时出错: ${error}`);
            console.error(`错误堆栈: ${error.stack}`);
            throw error;
        } finally {
            if (page) {
                await ChromeService.closePage(page);
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
