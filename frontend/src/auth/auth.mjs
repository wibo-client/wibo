/**
 * 用来处理登录和注册的逻辑
 */

class AuthClass {
  constructor() {
    this.sessionId = Date.now().toString(); // 生成会话ID
  }

  async login(username, password) {
    try {
      // 获取验证码
      const captchaBlob = await window.auth.generateCaptcha();

      // 显示验证码对话框
      const captchaCode = await this.showCaptchaDialog(captchaBlob);
      if (!captchaCode) {
        throw new Error('验证码输入已取消');
      }

      // 进行登录
      const result = await window.auth.login(username, password, captchaCode);

      if (result.token) {
        await window.auth.setToken(result.token);
        return true;
      }
      return false;
    } catch (error) {
      console.error('登录错误:', error);
      await window.electron.showErrorBox('登录失败', error.message);
      return false;
    }
  }

  async showCaptchaDialog(captchaImage) {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'captcha-dialog';
      dialog.innerHTML = `
        <div class="captcha-content">
          <h3>请输入验证码</h3>
          <img src="data:image/png;base64,${captchaImage.toString('base64')}" alt="验证码">
          <input type="text" id="captchaInput" placeholder="输入验证码" maxlength="4">
          <div class="captcha-buttons">
            <button id="confirmCaptcha">确认</button>
            <button id="cancelCaptcha">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      // 绑定事件
      dialog.querySelector('#confirmCaptcha').onclick = () => {
        const code = dialog.querySelector('#captchaInput').value;
        document.body.removeChild(dialog);
        resolve(code);
      };

      dialog.querySelector('#cancelCaptcha').onclick = () => {
        document.body.removeChild(dialog);
        resolve(null);
      };
    });
  }

  async register(username, password) {
    try {
      const result = await window.auth.register(username, password);
      if (result) {
        await window.electron.showMessageBox({
          type: 'info',
          title: '注册成功',
          message: '注册成功，请登录'
        });
        return true;
      }
    } catch (error) {
      console.error('注册错误:', error);
      await window.electron.showErrorBox('注册失败', error.message);
      return false;
    }
  }

  async getCurrentUser() {
    try {
      return await window.auth.getCurrentUser();
    } catch (error) {
      console.error('获取当前用户失败:', error);
      return null;
    }
  }

  // Token 相关方法保持不变
  async getToken() {
    return await window.auth.getToken();
  }

  async setToken(token) {
    return await window.auth.setToken(token);
  }

  async removeToken() {
    return await window.auth.removeToken();
  }
}

export default AuthClass;