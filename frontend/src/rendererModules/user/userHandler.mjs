import AuthClass from '../../auth/auth.mjs';

export default class UserHandler {
  constructor() {
    this.auth = new AuthClass();
    this.setupUI();
    this.bindEvents();
  }

  setupUI() {
    // 添加用户菜单到body
    const userMenuHTML = `
      <div class="user-menu">
        <button class="user-menu-trigger">👤</button>
        <div class="user-menu-dropdown">
          <div class="user-info">未登录</div>
          <button class="login-btn">🔑 登录</button>
          <button class="register-btn">📝 注册</button>
          <button class="logout-btn" style="display:none">🚪 退出</button>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', userMenuHTML);
  }

  bindEvents() {
    const menuTrigger = document.querySelector('.user-menu-trigger');
    const dropdown = document.querySelector('.user-menu-dropdown');
    const loginBtn = document.querySelector('.login-btn');
    const registerBtn = document.querySelector('.register-btn');
    const logoutBtn = document.querySelector('.logout-btn');

    // 切换下拉菜单
    menuTrigger.addEventListener('click', () => {
      dropdown.classList.toggle('active');
    });

    // 点击其他地方关闭菜单
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.user-menu')) {
        dropdown.classList.remove('active');
      }
    });

    // 登录按钮点击事件
    loginBtn.addEventListener('click', () => this.showLoginDialog());

    // 注册按钮点击事件
    registerBtn.addEventListener('click', () => this.showRegisterDialog());

    // 退出按钮点击事件
    logoutBtn.addEventListener('click', () => this.handleLogout());
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

    // 绑定事件
    dialog.querySelector('#confirmLogin').onclick = async () => {
      const username = dialog.querySelector('#loginUsername').value;
      const password = dialog.querySelector('#loginPassword').value;
      const success = await this.auth.login(username, password);
      if (success) {
        this.updateUIAfterLogin(username);
        document.body.removeChild(dialog);
      }
    };

    dialog.querySelector('#cancelLogin').onclick = () => {
      document.body.removeChild(dialog);
    };
  }

  async showRegisterDialog() {
    // 类似 showLoginDialog 的实现
    // ...
  }

  updateUIAfterLogin(username) {
    const userInfo = document.querySelector('.user-info');
    const loginBtn = document.querySelector('.login-btn');
    const registerBtn = document.querySelector('.register-btn');
    const logoutBtn = document.querySelector('.logout-btn');

    userInfo.textContent = `👤 ${username}`;
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
