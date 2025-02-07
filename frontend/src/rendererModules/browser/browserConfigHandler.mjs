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
        'pageFetchLimit',
        'llmConcurrency'  // 添加新的配置项
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
    config.llmConcurrency = document.getElementById('llmConcurrency')?.value;  // 添加新配置项的保存

    await window.electron.setGlobalConfig(config);

    await window.electron.showMessageBox({
      type: 'info',
      title: '保存成功',
      message: '配置已保存'
    });

    await this.loadConfigValues();
    await window.electron.reinitialize();
  }

  async handleSaveAK() {
    const accessKeyInput = document.getElementById('accessKey');
    if (!accessKeyInput?.value) {
      await window.electron.showMessageBox({
        type: 'warning',
        title: '输入验证',
        message: '请输入Access Key'
      });
      return;
    }

    const config = await window.electron.getGlobalConfig();
    config.modelSK = accessKeyInput.value;

    await window.electron.setGlobalConfig(config);
    await window.electron.showMessageBox({
      type: 'info',
      title: '保存成功',
      message: 'Access Key已保存在客户端'
    });

    // 清空输入框
    accessKeyInput.value = '';

    await this.loadConfigValues();
  }
}