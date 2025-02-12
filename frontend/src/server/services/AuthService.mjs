import Store from 'electron-store';
import logger from '../../utils/loggerUtils.mjs';

class AuthService {
  static API_PATH = '/api';
  static TOKEN_REFRESH_INTERVAL = 15 * 60 * 1000; // 15分钟
  static TOKEN_EXPIRY = 30 * 60 * 1000; // 30分钟

  constructor() {
    this.store = new Store({ name: 'authStore' });
    this.baseUrl = null;
    this.currentSessionId = null;
    this.lastTokenRefresh = null;
  }

  async init(globalContext) {
    this.globalContext = globalContext;
    await this.updateBaseUrl();
  }

  async updateBaseUrl() {
    if (!this.globalContext) {
      throw new Error('Global context not initialized');
    }
    const baseUrl = await this.globalContext.configHandler.getWiboServiceUrl();
    this.baseUrl = `${baseUrl}${AuthService.API_PATH}`;
  }

  // 添加通用的请求配置
  getRequestConfig(options = {}) {
    return {
      ...options,
      credentials: 'include', // 确保包含cookies
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // 移除可能影响CORS的自定义headers
        ...options.headers
      }
    };
  }

  async register(username, password) {
    try {
      await this.updateBaseUrl();  // 确保使用最新的 baseUrl
      const response = await fetch(`${this.baseUrl}/user/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          password
        })
      });

      // 检查HTTP状态码
      if (!response.ok) {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.message || '服务器错误');
        } catch (e) {
          throw new Error(`服务器错误: ${text || response.statusText}`);
        }
      }

      // 尝试解析JSON响应
      let data;
      try {
        data = await response.json();
      } catch (e) {
        console.error('JSON解析错误:', e);
        console.error('原始响应:', await response.text());
        throw new Error('服务器返回了无效的数据格式');
      }

      if (!data.success) {
        throw new Error(data.message || '操作失败');
      }

      return data.data;

    } catch (error) {
      console.error('注册请求失败:', error);
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        throw new Error('无法连接到服务器，请检查网络连接');
      }
      throw new Error(`注册失败: ${error.message}`);
    }
  }

  // 修改后的登录方法
  async login(username, password, captchaCode) {
    try {
      await this.updateBaseUrl();
      if (!this.currentSessionId) {
        logger.error('No valid session found');
        throw new Error('会话已失效，请重新获取验证码');
      }

      logger.info('Logging in with session:', this.currentSessionId);

      const response = await fetch(`${this.baseUrl}/user/login`,
        this.getRequestConfig({
          method: 'POST',
          headers: {
            'Cookie': `JSESSIONID=${this.currentSessionId}`
          },
          body: JSON.stringify({
            username,
            password,
            captcha: captchaCode
          })
        })
      );

      if (!response.ok) {
        const text = await response.text();
        try {
          const errorData = JSON.parse(text);
          throw new Error(errorData.message || '服务器错误');
        } catch (e) {
          throw new Error(`服务器错误: ${text || response.statusText}`);
        }
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || '登录失败');
      }

      // 从响应数据中正确提取 token
      const { user, accessToken, refreshToken } = data.data;

      // 存储令牌
      this.setTokens(accessToken, refreshToken);

      // 登录成功后清除当前session
      this.currentSessionId = null;

      // 返回完整的登录响应数据
      return {
        user,
        accessToken,
        refreshToken
      };

    } catch (error) {
      logger.error('登录请求失败:', error);
      throw error;
    }
  }

  // 修改后的获取当前用户方法
  async getCurrentUser() {
    try {
      const { accessToken, refreshToken } = this.getTokens();
      if (!accessToken || !refreshToken) {
        return null;
      }

      // 检查是否需要刷新令牌
      if (this.needsRefresh()) {
        await this.refreshAccessToken();
      }

      const response = await fetch(`${this.baseUrl}/user/current`, {
        headers: {
          'Authorization': `Bearer ${this.getTokens().accessToken}`
        },
        credentials: 'include'
      });

      if (response.status === 401) {
        // 如果令牌已过期，尝试刷新
        await this.refreshAccessToken();
        // 使用新令牌重试请求
        const retryResponse = await fetch(`${this.baseUrl}/user/current`, {
          headers: {
            'Authorization': `Bearer ${this.getTokens().accessToken}`
          },
          credentials: 'include'
        });

        const retryData = await retryResponse.json();
        if (!retryData.success) {
          throw new Error(retryData.message);
        }
        return retryData.data;
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      return data.data;

    } catch (error) {
      logger.error('获取用户信息失败:', error);
      if (error.message.includes('Failed to refresh token')) {
        this.removeTokens();
        return null;
      }
      throw error;
    }
  }

  async generateCaptcha() {
    try {
      await this.updateBaseUrl();  // 确保使用最新的 baseUrl
      const response = await fetch(`${this.baseUrl}/captcha`,
        this.getRequestConfig()
      );

      if (!response.ok) {
        throw new Error('获取验证码失败');
      }

      // 从Set-Cookie头中提取JSESSIONID
      const cookies = response.headers.get('Set-Cookie');
      if (cookies) {
        const sessionMatch = cookies.match(/JSESSIONID=([^;]+)/);
        if (sessionMatch) {
          this.currentSessionId = sessionMatch[1];
          logger.info('Captured Session ID:', this.currentSessionId);
        }
      }

      logger.debug('Captcha Response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        sessionId: this.currentSessionId
      });

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      return base64;

    } catch (error) {
      logger.error('验证码请求失败:', error);
      throw error;
    }
  }

  // Token 相关的存储方法
  getTokens() {
    return {
      accessToken: this.store.get('accessToken', null),
      refreshToken: this.store.get('refreshToken', null),
      tokenTimestamp: this.store.get('tokenTimestamp', null)
    };
  }

  setTokens(accessToken, refreshToken) {
    this.store.set('accessToken', accessToken);
    this.store.set('refreshToken', refreshToken);
    this.store.set('tokenTimestamp', Date.now());
    this.lastTokenRefresh = Date.now();
  }

  removeTokens() {
    this.store.delete('accessToken');
    this.store.delete('refreshToken');
    this.store.delete('tokenTimestamp');
    this.lastTokenRefresh = null;
  }

  isTokenExpired() {
    const { tokenTimestamp } = this.getTokens();
    if (!tokenTimestamp) return true;
    return Date.now() - tokenTimestamp > AuthService.TOKEN_EXPIRY;
  }

  needsRefresh() {
    const { tokenTimestamp } = this.getTokens();
    if (!tokenTimestamp) return false;
    return Date.now() - tokenTimestamp > AuthService.TOKEN_REFRESH_INTERVAL;
  }

  // 刷新令牌的方法
  async refreshAccessToken() {
    try {
      const { refreshToken } = this.getTokens();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshToken}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to refresh token');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Token refresh failed');
      }

      this.setTokens(data.data.accessToken, refreshToken); // 只更新访问令牌
      return data.data.accessToken;
    } catch (error) {
      logger.error('Token refresh failed:', error);
      this.removeTokens(); // 刷新失败时清除所有令牌
      throw error;
    }
  }

  async logout() {
    try {
      await this.updateBaseUrl();
      const { accessToken } = this.getTokens();

      // if (accessToken) {
      //   // 调用后端登出接口
      //   const response = await fetch(`${this.baseUrl}/user/logout`, {
      //     method: 'POST',
      //     headers: {
      //       'Authorization': `Bearer ${accessToken}`,
      //       'Content-Type': 'application/json'
      //     }
      //   });

      //   if (!response.ok) {
      //     logger.warn('Logout request failed:', response.status);
      //   }
      // }

      // 无论后端请求是否成功，都清除本地存储的令牌
      this.removeTokens();
      logger.info('User logged out successfully');

      return { success: true };
    } catch (error) {
      logger.error('Logout failed:', error);
      // 即使出错也要清除本地令牌
      this.removeTokens();
      throw error;
    }
  }
}

export default AuthService;
