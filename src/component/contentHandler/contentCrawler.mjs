import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// 使用 stealth 插件
puppeteer.use(StealthPlugin());

export class ContentCrawler {
    async fetchPageContent(url, headless = true) {
        console.error("开始处理任务");

        for (let attempt = 1; attempt <= 3; attempt++) {
            let browser;
            try {
                // 启动浏览器（有头模式）
                browser = await puppeteer.launch({
                    headless: headless,
                    args: [
                        '--window-size=833x731',
                        '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
                        '--disable-features=BlockThirdPartyCookies', // 禁用阻止第三方 Cookie 的功能
                        '--no-sandbox', // 添加 --no-sandbox 参数
                        '--disable-setuid-sandbox' // 添加 --disable-setuid-sandbox 参数
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

                // 设置 protocolTimeout
                page.setDefaultNavigationTimeout(60000);

                // 打开指定的 URL
                await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                // 等待页面加载完毕
                await page.waitForSelector('body', { timeout: 30000 });

                // 获取页面的所有字符
                const pageContent = await page.evaluate(() => document.body.innerText);

                // 获取当前页面的 URL
                const currentUrl = page.url();

                const markdownText = this.convertToMarkdown(pageContent);
                // 输出页面的所有字符
                console.log(markdownText);

                return markdownText;
            } catch (error) {
                console.error(`Attempt ${attempt} failed:`, error);
                if (attempt === 3) {
                    throw error;
                }
            } finally {
                if (browser) {
                    await browser.close();
                }
            }
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

// 独立运行的示例
if (require.main === module) {
    const url = process.argv[2] || "https://blog.csdn.net/csdnnews/article/details/144706402?spm=1000.2115.3001.5927";
    const headless = process.argv[3] !== 'false'; // 默认 true，传 'false' 则为 false

    if (!url) {
        console.error("请提供一个 URL 地址");
        process.exit(1);
    }

    const crawler = new ContentCrawler();
    crawler.fetchPageContent(url, headless).then(({ markdownText, currentUrl }) => {
        console.log("Current URL:", currentUrl);
    }).catch(error => {
        console.error("处理任务时出错:", error);
    });
}

export default ContentCrawler;