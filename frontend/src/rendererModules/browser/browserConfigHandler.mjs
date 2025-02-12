export default class BrowserConfigHandler {
  constructor() {
    this.setupEventListeners();
    this.loadConfigValues();
    this.setupModelTabs();
    this.initServiceStatus();
  }

  setupEventListeners() {
    const saveBrowserConfigButton = document.getElementById('saveBrowserConfigButton');
    if (saveBrowserConfigButton) {
      saveBrowserConfigButton.addEventListener('click', () => this.handleSaveConfig());
    }

    // 添加高级设置切换按钮事件监听
    const toggleAdvancedSettings = document.getElementById('toggleAdvancedSettings');
    const advancedSettings = document.getElementById('advancedSettings');
    if (toggleAdvancedSettings && advancedSettings) {
      // 初始状态设为隐藏
      advancedSettings.style.display = 'none';
      toggleAdvancedSettings.textContent = '显示高级设置';

      toggleAdvancedSettings.addEventListener('click', (e) => {
        e.preventDefault();
        const isHidden = advancedSettings.style.display === 'none';
        advancedSettings.style.display = isHidden ? 'block' : 'none';
        toggleAdvancedSettings.textContent = isHidden ? '隐藏高级设置' : '显示高级设置';
      });
    }

    // 添加还原默认设置按钮事件监听
    const restoreDefaultSettings = document.getElementById('restoreDefaultSettings');
    if (restoreDefaultSettings) {
      restoreDefaultSettings.addEventListener('click', () => this.handleRestoreDefaults());
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

  async handleRestoreDefaults() {
    const result = await window.electron.showMessageBox({
      type: 'question',
      title: '确认还原',
      message: '确定要还原为默认设置吗？这将重置所有模型相关配置。',
      buttons: ['确定', '取消']
    });

    // 修改这里：检查返回对象中的 response 属性
    if (result.response === 0) { // 用户点击了"确定"
      try {
        const defaultConfig = {
          modelBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          modelName: 'qwen-plus'
        };

        const currentConfig = await window.electron.getGlobalConfig();
        const newConfig = {
          ...currentConfig,
          ...defaultConfig
        };

        await window.electron.setGlobalConfig(newConfig);
        await this.loadConfigValues();

        await window.electron.showMessageBox({
          type: 'info',
          title: '还原成功',
          message: '已还原为默认设置'
        });
      } catch (error) {
        console.error('还原默认设置失败:', error);
        await window.electron.showMessageBox({
          type: 'error',
          title: '错误',
          message: '还原默认设置失败: ' + error.message
        });
      }
    }
  }

  async initServiceStatus() {
    try {
      const currentUser = await window.auth.getCurrentUser();
      const statusIcon = document.querySelector('#hosted-panel .status-icon');
      const statusText = document.querySelector('#serviceStatusText');
      const usernameText = document.querySelector('#serviceUsername');

      if (currentUser) {
        statusIcon.classList.add('connected');
        statusText.textContent = '已连接';
        usernameText.textContent = currentUser.username;
      } else {
        statusIcon.classList.remove('connected');
        statusText.textContent = '未连接';
        usernameText.textContent = '未登录';
      }
    } catch (error) {
      console.error('初始化服务状态失败:', error);
    }
  }

  setupModelTabs() {
    const tabs = document.querySelectorAll('.model-tab');
    const panels = document.querySelectorAll('.model-tab-content');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // 移除所有活动状态
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));

        // 添加新的活动状态
        tab.classList.add('active');
        const panel = document.getElementById(`${tab.dataset.tab}-panel`);
        if (panel) {
          panel.classList.add('active');
        }
      });
    });
  }
}