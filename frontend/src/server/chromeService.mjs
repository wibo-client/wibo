import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 在 ChromeService 中统一初始化 puppeteer
puppeteer.use(StealthPlugin());

class ChromeService {
  constructor() {
    this.browser = null;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.localChromePath = path.join(__dirname, '..', '..', 'chrome', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
  }

  async getBrowser(userOptions = {}) {
    if (this.browser) {
      return this.browser;
    }

    try {
      const defaultOptions = {};
      console.log('启动浏览器 path = ', this.localChromePath);
      // 检查本地 Chrome 是否存在
      if (fs.existsSync(this.localChromePath)) {
        console.log('使用本地 Chrome');
        defaultOptions.executablePath = this.localChromePath;
      } else {
        console.log('使用系统默认 Chrome');
      }

      // 合并用户配置和默认配置
      const options = { ...defaultOptions, ...userOptions };
      
      this.browser = await puppeteer.launch(options);
      console.log('成功启动浏览器');
      
      // 监听浏览器关闭事件
      this.browser.on('disconnected', () => {
        console.log('浏览器已断开连接');
        this.browser = null;
      });

      return this.browser;
    } catch (error) {
      console.error('启动浏览器失败:', error);
      throw error;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log('浏览器已关闭');
    }
  }

  // 暴露 puppeteer 实例,供其他模块使用
  static getPuppeteer() {
    return puppeteer;
  }
}

export default new ChromeService();
