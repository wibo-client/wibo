class ConfigHandler {
  constructor(store) {
    this.store = store;
  }

  getConfig(key) {
    return this.store.get(key);
  }s

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
}

export default ConfigHandler;
