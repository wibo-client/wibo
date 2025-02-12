import bcrypt from 'bcrypt';
import Store from 'electron-store';
import JwtUtil from '../utils/JwtUtil.mjs';
import CaptchaGenerator from '../utils/CaptchaGenerator.mjs';

class AuthService {
  constructor() {
    this.store = new Store({ name: 'userStore' }); // 创建专门的用户数据存储
    this.jwtUtil = new JwtUtil();
    this.captchaGenerator = new CaptchaGenerator();
    this.sessionStore = new Map();

    // 初始化用户存储
    if (!this.store.has('users')) {
      this.store.set('users', {});
    }
  }

  async register(username, password) {
    try {
      const users = this.store.get('users');

      // 检查用户是否已存在
      if (users[username]) {
        throw new Error('用户名已存在');
      }

      // 密码加密
      const hashedPassword = await bcrypt.hash(password, 10);

      // 创建新用户
      const newUser = {
        id: Date.now().toString(), // 使用时间戳作为简单的ID
        username,
        password: hashedPassword,
        createdAt: new Date().toISOString()
      };

      // 保存用户
      users[username] = newUser;
      this.store.set('users', users);

      // 返回用户信息（不包含密码）
      const { password: _, ...userWithoutPassword } = newUser;
      return userWithoutPassword;

    } catch (error) {
      throw new Error(`注册失败: ${error.message}`);
    }
  }

  async login(username, password, captchaCode, sessionId) {
    try {
      // 验证验证码
      const storedCaptcha = this.sessionStore.get(`captcha_${sessionId}`);
      if (!storedCaptcha) {
        throw new Error('验证码已过期');
      }
      if (storedCaptcha.toLowerCase() !== captchaCode.toLowerCase()) {
        throw new Error('验证码错误');
      }

      // 清除验证码
      this.sessionStore.delete(`captcha_${sessionId}`);

      // 查找用户
      const users = this.store.get('users');
      const user = users[username];

      if (!user) {
        throw new Error('用户不存在');
      }

      // 验证密码
      const isValid = await bcrypt.compare(password, user.password);
      if (!isValid) {
        throw new Error('密码错误');
      }

      // 生成token
      const token = this.jwtUtil.generateToken(user);

      // 返回用户信息（不包含密码）
      const { password: _, ...userWithoutPassword } = user;
      return {
        user: userWithoutPassword,
        token
      };

    } catch (error) {
      throw new Error(`登录失败: ${error.message}`);
    }
  }

  async generateCaptcha(sessionId) {
    try {
      // 生成验证码
      const captcha = this.captchaGenerator.generate();

      // 存储验证码（5分钟有效）
      this.sessionStore.set(`captcha_${sessionId}`, captcha.code);
      setTimeout(() => {
        this.sessionStore.delete(`captcha_${sessionId}`);
      }, 5 * 60 * 1000);

      return captcha.imageBuffer;

    } catch (error) {
      throw new Error(`生成验证码失败: ${error.message}`);
    }
  }

  async getCurrentUser(token) {
    try {
      // 验证token
      const payload = this.jwtUtil.verifyToken(token);
      if (!payload) {
        throw new Error('无效的token');
      }

      // 查找用户
      const users = this.store.get('users');
      const user = Object.values(users).find(u => u.id === payload.userId);

      if (!user) {
        throw new Error('用户不存在');
      }

      // 返回用户信息（不包含密码）
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;

    } catch (error) {
      throw new Error(`获取用户信息失败: ${error.message}`);
    }
  }

  // 中间件：验证token
  validateToken(req, res, next) {
    try {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) {
        throw new Error('未提供token');
      }

      const payload = this.jwtUtil.verifyToken(token);
      if (!payload) {
        throw new Error('无效的token');
      }

      req.user = payload;
      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        message: error.message
      });
    }
  }

  // 新增：用户数据管理方法
  async updateUser(userId, userData) {
    const users = this.store.get('users');
    const user = Object.values(users).find(u => u.id === userId);

    if (!user) {
      throw new Error('用户不存在');
    }

    // 更新用户数据
    const updatedUser = { ...user, ...userData };
    users[user.username] = updatedUser;
    this.store.set('users', users);

    const { password: _, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async changePassword(userId, oldPassword, newPassword) {
    const users = this.store.get('users');
    const user = Object.values(users).find(u => u.id === userId);

    if (!user) {
      throw new Error('用户不存在');
    }

    // 验证旧密码
    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) {
      throw new Error('原密码错误');
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    user.password = hashedPassword;
    users[user.username] = user;
    this.store.set('users', users);

    return true;
  }
}

export default AuthService;
