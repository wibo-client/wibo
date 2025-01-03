import Store from 'electron-store'; // 确保导入 electron-store
import ConfigKeys from './configKeys.mjs'; // 引入共享的配置枚举值
class ConfigHandler {
  constructor() {
    this.store = new Store({ name: 'globalConfigStore' }); // 在这里实例化 Store
  }

  async getConfig(key) {
    let ret =  this.store.get(key,[]);
    return ret;
  }
  async getGlobalConfig() {
    return this.store.get(ConfigKeys.APP_GLOBAL_CONFIG, {});
  }
  async setGlobalConfig(value) {
    this.store.set(ConfigKeys.APP_GLOBAL_CONFIG, value);
  }

  async setConfig(key, value) {
    this.store.set(key, value);
  }

  getToken() {
    return this.store.get('authToken');
  }

  setToken(token) {
    this.store.set('authToken', token);
  }

  removeToken() {
    this.store.delete('authToken');
  }

}

export default ConfigHandler;
