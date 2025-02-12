import AuthClass from '../auth/auth.mjs';

export default class UserHandler {
  constructor() {
    this.auth = new AuthClass();
    try {
      this.setupUI();
      this.bindEvents();
      this.checkLoginStatus().catch(error => {
        console.error('检查登录状态失败:', error);
        window.electron.showErrorBox('初始化失败', '检查登录状态时发生错误: ' + error.message);
      });
    } catch (error) {
      console.error('初始化用户处理器失败:', error);
      window.electron.showErrorBox('初始化失败', '初始化用户界面时发生错误: ' + error.message);
    }
  }

  setupUI() {
    // 在右上角添加用户菜单
    const userMenu = document.createElement('div');
    userMenu.className = 'user-menu';
    userMenu.innerHTML = `
      <button class="user-menu-trigger">👤</button>
      <div class="user-menu-dropdown">
        <div class="user-info">未登录</div>
        <button class="login-btn">🔑 登录</button>
        <button class="register-btn">📝 注册</button>
        <button class="logout-btn" style="display:none">🚪 退出</button>
      </div>
    `;
    document.body.appendChild(userMenu);
  }

  async checkLoginStatus() {
    try {
      const currentUser = await this.auth.getCurrentUser();
      if (currentUser) {
        this.updateUIAfterLogin(currentUser);
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
      window.electron.showErrorBox('登录状态检查失败', error.message);
    }
  }

  bindEvents() {
    const menuTrigger = document.querySelector('.user-menu-trigger');
    const dropdown = document.querySelector('.user-menu-dropdown');

    // 切换下拉菜单
    menuTrigger.addEventListener('click', () => dropdown.classList.toggle('active'));

    // 点击其他区域关闭菜单
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        dropdown.classList.remove('active');
      }
    });

    // 登录按钮事件
    document.querySelector('.login-btn').addEventListener('click', () => {
      this.showLoginDialog();
    });

    // 注册按钮事件
    document.querySelector('.register-btn').addEventListener('click', () => {
      this.showRegisterDialog();
    });

    // 退出按钮事件
    document.querySelector('.logout-btn').addEventListener('click', () => {
      this.handleLogout();
    });
  }

  async showLoginDialog() {
    try {
      const dialog = document.createElement('div');
      dialog.className = 'auth-dialog';
      dialog.innerHTML = `
        <div class="auth-dialog-content">
          <h3>🔐 登录</h3>
          <input type="text" id="loginUsername" placeholder="用户名" required />
          <input type="password" id="loginPassword" placeholder="密码" required />
          <div class="auth-buttons">
            <button id="confirmLogin">确认</button>
            <button id="cancelLogin">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      dialog.querySelector('#confirmLogin').onclick = async () => {
        try {
          const username = dialog.querySelector('#loginUsername').value.trim();
          const password = dialog.querySelector('#loginPassword').value;

          if (!username || !password) {
            throw new Error('用户名和密码不能为空');
          }

          const success = await this.auth.login(username, password);
          if (success) {
            document.body.removeChild(dialog);
            await this.checkLoginStatus();
            await window.electron.showMessageBox({
              type: 'info',
              title: '登录成功',
              message: '欢迎回来，' + username
            });
          }
        } catch (error) {
          console.error('登录失败:', error);
          await window.electron.showErrorBox('登录失败', error.message);
        }
      };

      dialog.querySelector('#cancelLogin').onclick = () => {
        document.body.removeChild(dialog);
      };
    } catch (error) {
      console.error('显示登录对话框失败:', error);
      await window.electron.showErrorBox('系统错误', '显示登录界面时发生错误: ' + error.message);
    }
  }

  async showRegisterDialog() {
    try {
      const dialog = document.createElement('div');
      dialog.className = 'auth-dialog';
      dialog.innerHTML = `
        <div class="auth-dialog-content">
          <h3>📝 注册</h3>
          <input type="text" id="registerUsername" placeholder="用户名" required />
          <input type="password" id="registerPassword" placeholder="密码" required />
          <input type="password" id="confirmPassword" placeholder="确认密码" required />
          <div class="auth-buttons">
            <button id="confirmRegister">确认</button>
            <button id="cancelRegister">取消</button>
          </div>
        </div>
      `;
      document.body.appendChild(dialog);

      dialog.querySelector('#confirmRegister').onclick = async () => {
        try {
          const username = dialog.querySelector('#registerUsername').value.trim();
          const password = dialog.querySelector('#registerPassword').value;
          const confirmPassword = dialog.querySelector('#confirmPassword').value;

          // 输入验证
          if (!username || !password) {
            throw new Error('用户名和密码不能为空');
          }

          if (password !== confirmPassword) {
            throw new Error('两次输入的密码不一致');
          }

          if (password.length < 6) {
            throw new Error('密码长度不能少于6位');
          }

          const success = await this.auth.register(username, password);
          if (success) {
            document.body.removeChild(dialog);
          }
        } catch (error) {
          console.error('注册失败:', error);
          await window.electron.showErrorBox('注册失败', error.message);
        }
      };

      dialog.querySelector('#cancelRegister').onclick = () => {
        document.body.removeChild(dialog);
      };
    } catch (error) {
      console.error('显示注册对话框失败:', error);
      await window.electron.showErrorBox('系统错误', '显示注册界面时发生错误: ' + error.message);
    }
  }

  updateUIAfterLogin(user) {
    const userInfo = document.querySelector('.user-info');
    const loginBtn = document.querySelector('.login-btn');
    const registerBtn = document.querySelector('.register-btn');
    const logoutBtn = document.querySelector('.logout-btn');

    userInfo.textContent = `👤 ${user.username}`;
    loginBtn.style.display = 'none';
    registerBtn.style.display = 'none';
    logoutBtn.style.display = 'block';
  }

  async handleLogout() {
    try {
      await this.auth.removeToken();
      const userInfo = document.querySelector('.user-info');
      const loginBtn = document.querySelector('.login-btn');
      const registerBtn = document.querySelector('.register-btn');
      const logoutBtn = document.querySelector('.logout-btn');

      userInfo.textContent = '未登录';
      loginBtn.style.display = 'block';
      registerBtn.style.display = 'block';
      logoutBtn.style.display = 'none';

      await window.electron.showMessageBox({
        type: 'info',
        title: '退出成功',
        message: '您已成功退出登录'
      });
    } catch (error) {
      console.error('退出登录失败:', error);
      await window.electron.showErrorBox('退出失败', '退出登录时发生错误: ' + error.message);
    }
  }
}
