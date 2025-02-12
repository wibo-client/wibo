import AuthClass from '../../auth/auth.mjs';

export default class UserHandler {
  constructor() {
    this.auth = new AuthClass();
    this.setupUI();
    this.bindEvents();
    this.checkLoginStatus();
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
    const currentUser = await this.auth.getCurrentUser();
    if (currentUser) {
      this.updateUIAfterLogin(currentUser);
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
    const dialog = document.createElement('div');
    dialog.className = 'auth-dialog';
    dialog.innerHTML = `
      <div class="auth-dialog-content">
        <h3>🔐 登录</h3>
        <input type="text" id="loginUsername" placeholder="用户名" />
        <input type="password" id="loginPassword" placeholder="密码" />
        <div class="auth-buttons">
          <button id="confirmLogin">确认</button>
          <button id="cancelLogin">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#confirmLogin').onclick = async () => {
      const username = dialog.querySelector('#loginUsername').value;
      const password = dialog.querySelector('#loginPassword').value;
      const success = await this.auth.login(username, password);
      if (success) {
        document.body.removeChild(dialog);
        this.checkLoginStatus();
      }
    };

    dialog.querySelector('#cancelLogin').onclick = () => {
      document.body.removeChild(dialog);
    };
  }

  async showRegisterDialog() {
    const dialog = document.createElement('div');
    dialog.className = 'auth-dialog';
    dialog.innerHTML = `
      <div class="auth-dialog-content">
        <h3>📝 注册</h3>
        <input type="text" id="registerUsername" placeholder="用户名" />
        <input type="password" id="registerPassword" placeholder="密码" />
        <input type="password" id="confirmPassword" placeholder="确认密码" />
        <div class="auth-buttons">
          <button id="confirmRegister">确认</button>
          <button id="cancelRegister">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#confirmRegister').onclick = async () => {
      const username = dialog.querySelector('#registerUsername').value;
      const password = dialog.querySelector('#registerPassword').value;
      const confirmPassword = dialog.querySelector('#confirmPassword').value;

      if (password !== confirmPassword) {
        await window.electron.showErrorBox('注册失败', '两次输入的密码不一致');
        return;
      }

      const success = await this.auth.register(username, password);
      if (success) {
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#cancelRegister').onclick = () => {
      document.body.removeChild(dialog);
    };
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
    await this.auth.removeToken();
    const userInfo = document.querySelector('.user-info');
    const loginBtn = document.querySelector('.login-btn');
    const registerBtn = document.querySelector('.register-btn');
    const logoutBtn = document.querySelector('.logout-btn');

    userInfo.textContent = '未登录';
    loginBtn.style.display = 'block';
    registerBtn.style.display = 'block';
    logoutBtn.style.display = 'none';
  }
}
