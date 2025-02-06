/**
 * 用来处理登录和注册的逻辑
 */

class AuthClass {
  constructor(apiEndpoint) {
    const API_ENDING_POINT_DEFAULT = "http://localhost:8080/";
    this.apiEndpoint = apiEndpoint || API_ENDING_POINT_DEFAULT;
  }

  async login(username, password) {
    try {
      const response = await fetch(`${this.apiEndpoint}api/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (data.success) {
        await window.electron.showMessageBox({
          type: 'info',
          title: '登录成功',
          message: '登录成功'
        });
        await this.setToken(data.token);
        return true;
      } else {
        await window.electron.showErrorBox('登录失败', data.message);
        return false;
      }
    } catch (error) {
      console.error('登录错误:', error);
      await window.electron.showErrorBox('登录失败', error.message);
      return false;
    }
  }

  async register(username, password) {
    try {
      const response = await fetch(`${this.apiEndpoint}api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();
      if (data.success) {
        await window.electron.showMessageBox({
          type: 'info',
          title: '注册成功',
          message: '注册成功，请登录'
        });
        return true;
      } else {
        await window.electron.showErrorBox('注册失败', data.message);
        return false;
      }
    } catch (error) {
      console.error('注册错误:', error);
      await window.electron.showErrorBox('注册失败', error.message);
      return false;
    }
  }

  async getToken() {
    return await window.electron.invoke('get-token');
  }

  async setToken(token) {
    return await window.electron.invoke('set-token', token);
  }

  async removeToken() {
    return await window.electron.invoke('remove-token');
  }
}

export default AuthClass;