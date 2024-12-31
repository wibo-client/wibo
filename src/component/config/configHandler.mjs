import Store from 'electron-store'; // 确保导入 electron-store
import ConfigKeys from '../../config/configKeys.mjs'; // 引入共享的配置枚举值
class ConfigHandler {
  constructor() {
    this.store = new Store(); // 在这里实例化 Store
  }

  getConfig(key) {
    return this.store.get(key);
  }

  setConfig(key, value) {
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

  getPageFetchLimit() {
    return this.store.get(ConfigKeys.PAGE_FETCH_LIMIT);
  }

  setPageFetchLimit(limit) {
    this.store.set(ConfigKeys.PAGE_FETCH_LIMIT, limit);
  }
}

export default ConfigHandler;
