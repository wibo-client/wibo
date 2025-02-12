/**
 * 用来处理登录和注册的逻辑
 */

class AuthClass {
  constructor() {
    this.captchaImg = null; // 添加验证码图片引用
    this.currentCaptcha = null;
  }

  async login(username, password) {
    try {
      // 显示验证码对话框
      const captchaCode = await this.showCaptchaDialog();
      if (!captchaCode) {
        return false;
      }

      // 进行登录，移除 sessionId 参数
      const result = await window.auth.login(username, password, captchaCode);

      if (result.user) {

        return true;
      }
      return false;
    } catch (error) {
      console.error('登录错误:', error);
      await window.electron.showErrorBox('登录失败', error.message);
      return false;
    }
  }

  async refreshCaptcha(imgElement) {
    try {
      // 使用await确保验证码加载完成
      const newCaptchaBase64 = await window.auth.generateCaptcha();
      if (imgElement) {
        // 更新前记录旧的src以便释放
        const oldSrc = imgElement.src;
        imgElement.src = `data:image/png;base64,${newCaptchaBase64}`;
        // 确保新图片加载完成
        await new Promise((resolve) => {
          imgElement.onload = resolve;
        });
        // 释放旧的URL
        if (oldSrc.startsWith('data:')) {
          URL.revokeObjectURL(oldSrc);
        }
      }
    } catch (error) {
      console.error('刷新验证码失败:', error);
      await window.electron.showErrorBox('刷新验证码失败');
    }
  }

  async showCaptchaDialog() {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      dialog.className = 'captcha-dialog';

      dialog.innerHTML = `
        <div class="captcha-content">
          <h3>请输入验证码</h3>
          <div class="captcha-image-container">
            <img alt="验证码" title="点击刷新">
            <div class="refresh-hint">点击图片或按钮刷新验证码</div>
          </div>
          <input type="text" id="captchaInput" placeholder="输入验证码" maxlength="4" autocomplete="off">
          <div class="captcha-buttons">
            <button id="confirmCaptcha">确认</button>
            <button id="cancelCaptcha">取消</button>
            <button id="refreshCaptcha">刷新验证码</button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      // 先获取图片元素引用
      const imgElement = dialog.querySelector('img');

      // 设置初始验证码
      this.refreshCaptcha(imgElement).catch(console.error);

      // 添加刷新事件处理
      const refreshHandlers = [
        imgElement,
        dialog.querySelector('#refreshCaptcha')
      ];

      refreshHandlers.forEach(el => {
        if (el) { // 添加空检查
          el.addEventListener('click', async () => {
            try {
              await this.refreshCaptcha(imgElement);
            } catch (error) {
              await window.electron.showErrorBox('刷新失败', error.message);
            }
          });
        }
      });

      // 绑定确认按钮事件
      dialog.querySelector('#confirmCaptcha').onclick = () => {
        const code = dialog.querySelector('#captchaInput').value.trim();
        if (!code) {
          window.electron.showErrorBox('验证失败', '请输入验证码');
          return;
        }
        document.body.removeChild(dialog);
        resolve(code);
      };

      // 绑定取消按钮事件
      dialog.querySelector('#cancelCaptcha').onclick = () => {
        document.body.removeChild(dialog);
        resolve(null);
      };

      // 添加回车键确认功能
      const input = dialog.querySelector('#captchaInput');
      input.focus();
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          dialog.querySelector('#confirmCaptcha').click();
        }
      });
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

  async logout() {
    try {
      const result = await window.auth.logout();
      if (result.success) {
        return true;
      }
      return false;
    } catch (error) {
      console.error('退出登录失败:', error);
      await window.electron.showErrorBox('退出失败', error.message);
      return false;
    }
  }
}

export default AuthClass;