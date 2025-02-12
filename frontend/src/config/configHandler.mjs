import Store from 'electron-store'; // 确保导入 electron-store
export default class ConfigHandler {
  constructor() {
    this.store = new Store({ name: 'globalConfigStore' }); // 在这里实例化 Store

    // 统一的默认配置
    this.defaultConfig = {
      pageFetchLimit: 5,
      browserTimeout: 30,
      browserConcurrency: 5,
      headless: true,
      userDataDir: './userData',
      searchItemNumbers: 20,
      mktPlace: 'https://wibo.cc/mktplace',
      modelSK: null,
      modelBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      modelName: 'qwen-plus',
      authToken: null,
      defaultHandlerPath: '/baidu/', // 新增默认处理器路径配置
      llmConcurrency: 20,  // 添加默认的LLM并发限制
      llmProvider: 'wibo', // 新增：默认使用wibo实现
      useCustomModel: false, // 新增：默认不使用自定义模型
      wiboServiceBaseUrl: 'http://localhost:8989',  // 只保留基础URL配置
    };

    // 添加不存储的配置项
    this.runtimeConfig = {
      debugPort: '8080'  // 调试端口配置
    };
  }

  async getGlobalConfig() {
    const userConfig = this.store.get('appGlobalConfig', {});
    return {
      ...this.defaultConfig,  // 先展开默认配置
      ...userConfig          // 再展开用户配置，这样用户配置会覆盖默认配置
    };
  }

  async setGlobalConfig(value) {
    // 合并默认配置和新的配置值
    const newConfig = {
      ...this.defaultConfig,
      ...value
    };
    this.store.set('appGlobalConfig', newConfig);
  }

  getToken() {
    return this.store.get('authToken', this.defaultConfig.authToken);
  }

  setToken(token) {
    this.store.set('authToken', token);
  }

  removeToken() {
    this.store.delete('authToken');
  }

  async getPageFetchLimit() {
    const config = await this.getGlobalConfig();
    return config.pageFetchLimit || this.defaultConfig.pageFetchLimit;
  }

  async getBrowserTimeout() {
    const config = await this.getGlobalConfig();
    return config.browserTimeout || this.defaultConfig.browserTimeout;
  }

  async getBrowserConcurrency() {
    const config = await this.getGlobalConfig();
    return config.browserConcurrency || this.defaultConfig.browserConcurrency;
  }

  async getHeadless() {
    const config = await this.getGlobalConfig();
    return config.headless === undefined ? this.defaultConfig.headless : config.headless;
  }

  async getUserDataDir() {
    const config = await this.getGlobalConfig();
    return config.userDataDir || this.defaultConfig.userDataDir;
  }

  async getSearchItemNumbers() {
    const config = await this.getGlobalConfig();
    return config.searchItemNumbers || this.defaultConfig.searchItemNumbers;
  }

  async getMktPlace() {
    const config = await this.getGlobalConfig();
    return config.mktPlace || this.defaultConfig.mktPlace;
  }

  async getModelSK() {
    const config = await this.getGlobalConfig();
    return config.modelSK || this.defaultConfig.modelSK;
  }

  async getModelBaseUrl() {
    const config = await this.getGlobalConfig();
    return config.modelBaseUrl || this.defaultConfig.modelBaseUrl;
  }

  async getModelName() {
    const config = await this.getGlobalConfig();
    return config.modelName || this.defaultConfig.modelName;
  }

  async getDefaultHandlerPath() {
    const config = await this.getGlobalConfig();
    return config.defaultHandlerPath || this.defaultConfig.defaultHandlerPath;
  }

  async setDefaultHandlerPath(path) {
    const config = await this.getGlobalConfig();
    config.defaultHandlerPath = path;
    await this.setGlobalConfig(config);
  }

  async getLlmConcurrency() {
    const config = await this.getGlobalConfig();
    return config.llmConcurrency || this.defaultConfig.llmConcurrency;
  }

  async getLlmProvider() {
    const config = await this.getGlobalConfig();
    return config.llmProvider || this.defaultConfig.llmProvider;
  }

  async setLlmProvider(provider) {
    const config = await this.getGlobalConfig();
    config.llmProvider = provider;
    config.useCustomModel = provider === 'openai';  // 同步更新 useCustomModel 状态
    await this.setGlobalConfig(config);
  }

  async isUsingCustomModel() {
    const config = await this.getGlobalConfig();
    return config.useCustomModel || this.defaultConfig.useCustomModel;
  }

  async getWiboServiceUrl() {
    const config = await this.getGlobalConfig();
    return config.wiboServiceBaseUrl || this.defaultConfig.wiboServiceBaseUrl;
  }

  async setWiboServiceBaseUrl(baseUrl) {
    const config = await this.getGlobalConfig();
    config.wiboServiceBaseUrl = baseUrl;
    await this.setGlobalConfig(config);
  }

  // 添加获取调试端口的方法
  getDebugPort() {
    return this.runtimeConfig.debugPort;
  }
}
