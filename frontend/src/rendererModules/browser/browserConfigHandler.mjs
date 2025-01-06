import ConfigKeys from '../../config/configKeys.mjs';

export default class BrowserConfigHandler {
  constructor() {
    this.setupEventListeners();
    this.loadConfigValues();
  }

  setupEventListeners() {
    const saveBrowserConfigButton = document.getElementById('saveBrowserConfigButton');
    if (saveBrowserConfigButton) {
      saveBrowserConfigButton.addEventListener('click', () => this.handleSaveConfig());
    }
  }

  async loadConfigValues() {
    const configJson = await window.electron.getConfig('appGlobalConfig');
    if (configJson) {
      const config = JSON.parse(configJson);
      
      // 特殊处理 MODEL_SK，因为需要显示遮罩后的值
      if (config[ConfigKeys.MODEL_SK]) {
        const maskedSK = this.maskSK(config[ConfigKeys.MODEL_SK]);
        document.getElementById('masked-ak').textContent = `当前AK: ${maskedSK}`;
      }

      // 统一处理配置项
      const configFields = [
        ConfigKeys.BROWSER_TIMEOUT,
        ConfigKeys.BROWSER_CONCURRENCY,
        ConfigKeys.HEADLESS,
        ConfigKeys.PAGE_FETCH_LIMIT
      ];

      configFields.forEach(key => {
        const element = document.getElementById(key);
        if (element && config[key] !== undefined) {
          element.value = config[key];
        }
      });
    }
  }

  maskSK(sk) {
    if (sk.length <= 10) return sk;
    return sk.substring(0, 5) + '*'.repeat(sk.length - 10) + sk.slice(-5);
  }

  async handleSaveConfig() {
    const browserTimeout = document.getElementById(ConfigKeys.BROWSER_TIMEOUT)?.value;
    const browserConcurrency = document.getElementById(ConfigKeys.BROWSER_CONCURRENCY)?.value;
    const headless = document.getElementById(ConfigKeys.HEADLESS)?.value;
    const pageFetchLimit = document.getElementById(ConfigKeys.PAGE_FETCH_LIMIT)?.value;

    const config = {
      [ConfigKeys.BROWSER_TIMEOUT]: browserTimeout,
      [ConfigKeys.BROWSER_CONCURRENCY]: browserConcurrency, 
      [ConfigKeys.HEADLESS]: headless,
      [ConfigKeys.PAGE_FETCH_LIMIT]: pageFetchLimit
    };

    await window.electron.setConfig('appGlobalConfig', JSON.stringify(config));

    alert('配置已保存');
    await loadConfigValues();
    await window.electron.reinitialize();
  }
}