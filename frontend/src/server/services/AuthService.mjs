import logger from '../../utils/loggerUtils.mjs';

class AuthService {
  static API_PATH = '/api';  // 添加静态类变量存储 API 路径

  constructor() {
    this.baseUrl = null;
    this.currentSessionId = null;
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

  async login(username, password, captchaCode) {
    try {
      await this.updateBaseUrl();  // 确保使用最新的 baseUrl
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

      logger.debug('Login Response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries())
      });

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

      // 登录成功后清除当前session
      this.currentSessionId = null;

      return data.data;

    } catch (error) {
      logger.error('登录请求失败:', error);
      throw new Error(`登录失败: ${error.message}`);
    }
  }

  async getCurrentUser(token) {
    try {
      await this.updateBaseUrl();  // 确保使用最新的 baseUrl
      const response = await fetch(`${this.baseUrl}/user/current`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        credentials: 'include'
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      return data.data; // 返回用户信息

    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
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
}

export default AuthService;
