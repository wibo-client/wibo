import Store from 'electron-store';

class AuthService {
  constructor() {
    this.baseUrl = 'http://localhost:8989/api'; // 配置API基础URL
  }

  async register(username, password) {
    try {
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

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      return data.data; // 返回用户信息

    } catch (error) {
      throw new Error(`注册失败: ${error.message}`);
    }
  }

  async login(username, password, captchaCode) {
    try {
      const response = await fetch(`${this.baseUrl}/user/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include', // 重要：包含 cookies 以支持 session
        body: JSON.stringify({
          username,
          password,
          captcha: captchaCode
        })
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      return data.data; // 返回 LoginResponse 对象

    } catch (error) {
      throw new Error(`登录失败: ${error.message}`);
    }
  }

  async getCurrentUser(token) {
    try {
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
      const response = await fetch(`${this.baseUrl}/captcha`, {
        credentials: 'include' // 重要：包含 cookies 以支持 session
      });

      if (!response.ok) {
        throw new Error('获取验证码失败');
      }

      const blob = await response.blob();
      return blob;

    } catch (error) {
      throw new Error(`生成验证码失败: ${error.message}`);
    }
  }
}

export default AuthService;
