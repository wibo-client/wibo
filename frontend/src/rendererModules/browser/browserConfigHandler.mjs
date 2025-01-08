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

    // 添加AK保存按钮的事件监听
    const saveConfigButton = document.getElementById('saveConfigButton');
    if (saveConfigButton) {
      saveConfigButton.addEventListener('click', () => this.handleSaveAK());
    }
  }

  async loadConfigValues() {
    const config = await window.electron.getGlobalConfig();
    if (config) {
      // 处理 modelSK 的特殊显示
      if (config.modelSK) {
        const maskedSK = this.maskSK(config.modelSK);
        document.getElementById('masked-ak').textContent = `当前AK: ${maskedSK}`;
      }

      // 加载基础配置项
      const configFields = [
        'browserTimeout',
        'searchItemNumbers',
        'pageFetchLimit'
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
    const config = await window.electron.getGlobalConfig();
    config.browserTimeout = document.getElementById('browserTimeout')?.value;
    config.searchItemNumbers = document.getElementById('searchItemNumbers')?.value;
    config.pageFetchLimit = document.getElementById('pageFetchLimit')?.value;

    await window.electron.setGlobalConfig(config);

    alert('配置已保存');
    await this.loadConfigValues();
    await window.electron.reinitialize();
  }

  async handleSaveAK() {
    const accessKey = document.getElementById('accessKey')?.value;
    if (!accessKey) {
      alert('请输入Access Key');
      return;
    }

    const config = await window.electron.getGlobalConfig();
    config.modelSK = accessKey;

    await window.electron.setGlobalConfig(config);
    alert('Access Key已保存在客户端');
    await this.loadConfigValues();
  }
}