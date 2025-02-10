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

      // 显示 modelBaseUrl
      if (config.modelBaseUrl) {
        document.getElementById('masked-modelBaseUrl').textContent = `当前API地址: ${config.modelBaseUrl}`;
        document.getElementById('modelBaseUrl').value = config.modelBaseUrl;
      }

      // 显示 modelName
      if (config.modelName) {
        document.getElementById('masked-modelName').textContent = `当前模型: ${config.modelName}`;
        document.getElementById('modelName').value = config.modelName;
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
    const modelBaseUrlInput = document.getElementById('modelBaseUrl');
    const modelNameInput = document.getElementById('modelName');

    const config = await window.electron.getGlobalConfig();
    let hasChanges = false;
    
    // 更新配置，只在有新输入时更新对应的值
    if (accessKeyInput?.value) {
      config.modelSK = accessKeyInput.value;
      hasChanges = true;
    }
    
    if (modelBaseUrlInput?.value) {
      config.modelBaseUrl = modelBaseUrlInput.value;
      hasChanges = true;
    }
    
    if (modelNameInput?.value) {
      config.modelName = modelNameInput.value;
      hasChanges = true;
    }

    // 如果没有任何改变，提示用户
    if (!hasChanges) {
      await window.electron.showMessageBox({
        type: 'info',
        title: '提示',
        message: '没有检测到任何修改'
      });
      return;
    }

    await window.electron.setGlobalConfig(config);
    await window.electron.showMessageBox({
      type: 'info',
      title: '保存成功',
      message: '配置已保存在客户端'
    });

    // 清空输入框
    accessKeyInput.value = '';
    modelBaseUrlInput.value = '';
    modelNameInput.value = '';

    await this.loadConfigValues();
  }
}