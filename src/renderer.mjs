import AuthClass from './component/auth/auth.mjs';
import { marked } from 'marked'; // 从 npm 包中导入 marked

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 加载完成');
  setupEventListeners();
  setupLinkHandler(); // 添加链接处理器
  renderPlugins(); // 初始化插件列表
});

async function handleLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const apiEndpoint = await window.electron.getConfig('apiEndpoint') || API_ENDING_POINT_DEFAULT;
  const auth = new AuthClass(apiEndpoint);

  const success = await auth.login(username, password);
  if (success) {
    document.querySelector('.tab[data-tab="interaction"]').click();
  }
}

async function handleRegister() {
  const username = document.getElementById('regUsername').value;
  const password = document.getElementById('regPassword').value;
  const apiEndpoint = await window.electron.getConfig('apiEndpoint') || API_ENDING_POINT_DEFAULT;
  const auth = new AuthClass(apiEndpoint);

  const success = await auth.register(username, password);
  if (success) {
    switchToTab('login');
  }
}

function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
}

function setupEventListeners() {
  document.getElementById('loginButton').addEventListener('click', handleLogin);
  document.getElementById('submitRegisterButton').addEventListener('click', handleRegister);
  document.getElementById('registerButton').addEventListener('click', () => switchToTab('register'));
  document.getElementById('cancelRegisterButton').addEventListener('click', () => switchToTab('login'));

  setupTabSwitching();
  setupMessageHooks();
  setupPathInputHandlers();

  // Event listener for importing local plugin
  document.getElementById('importLocalPluginButton').addEventListener('click', async () => {
    const filePath = await window.electron.selectFile();
    if (filePath) {
      await window.electron.addPluginFromFile(filePath);
      await renderPlugins(); // 刷新插件列表
    }
  });
}

function setupTabSwitching() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchToTab(tab.getAttribute('data-tab'));
    });
  });
}

function setupMessageHooks() {
  const sendButton = document.getElementById('sendButton');
  const chatInput = document.getElementById('chatInput');

  sendButton.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (event) => {
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      sendMessage();
    }
  });
  chatInput.addEventListener('focus', () => {
    document.getElementById('pathDropdown').style.display = 'none';
  });
}

async function sendMessage() {
  const message = document.getElementById('chatInput').value;
  const type = document.getElementById('typeSelect').value;
  const path = document.getElementById('pathInput').value;

  try {
    const feedbackBox = document.getElementById('feedbackBox');
    
    // 用户输入信息
    const userMessageElement = document.createElement('div');
    userMessageElement.className = 'message user';
    userMessageElement.innerHTML = `你：<br><br>${message} <br><br><br>`;
    feedbackBox.appendChild(userMessageElement);

    // 清空用户输入框
    document.getElementById('chatInput').value = '';

    // 系统回复信息
    const wibaMessageElement = document.createElement('div');
    wibaMessageElement.className = 'message wiba';
    wibaMessageElement.innerHTML = '';
    feedbackBox.appendChild(wibaMessageElement);

    feedbackBox.scrollTop = feedbackBox.scrollHeight;
    let wholeMessage = '# WIBO : \n\n';
    const requestContext = {
      onChunk: (chunk) => {
        wholeMessage += chunk;
        wibaMessageElement.innerHTML = marked(wholeMessage); // 确保使用全局 marked
        feedbackBox.scrollTop = feedbackBox.scrollHeight;
      }
    }
    window.electron.sendMessage(message, type, path, requestContext);
  } catch (error) {
    console.error('发送消息错误:', error);
  }
}

async function fetchPathSuggestions(input) {
  try {
    await window.electron.fetchPathSuggestions(input);
  } catch (error) {
    console.error('获取路径建议错误:', error);
  }
}

function setupPathInputHandlers() {
  const pathInput = document.getElementById('pathInput');
  const pathDropdown = document.getElementById('pathDropdown');

  pathInput.addEventListener('input', async () => {
    const input = pathInput.value;
    if (input) {
      await fetchPathSuggestions(input);
    } else {
      pathDropdown.innerHTML = '';
      pathDropdown.style.display = 'none';
    }
  });

  pathInput.addEventListener('focus', async () => {
    const input = pathInput.value;
    if (input) {
      await fetchPathSuggestions(input);
    }
  });

  pathInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      const firstSuggestion = pathDropdown.querySelector('div');
      if (firstSuggestion && firstSuggestion.textContent !== '...') {
        pathInput.value += firstSuggestion.textContent;
        pathDropdown.innerHTML = '';
        pathDropdown.style.display = 'none';
        await fetchPathSuggestions(pathInput.value);
      }
    }
  });

  pathDropdown.addEventListener('click', async (event) => {
    if (event.target.tagName === 'DIV' && event.target.textContent !== '...') {
      pathInput.value += event.target.textContent;
      pathDropdown.innerHTML = '';
      pathDropdown.style.display = 'none';
      await fetchPathSuggestions(pathInput.value);
    }
  });
}

function setupLinkHandler() {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target.tagName === 'A' && target.href) {
      event.preventDefault();
      window.electron.shell.openExternal(target.href); // 使用 window.electron.shell.openExternal
    }
  });
}

async function deletePlugin(pathPrefix) {
  try {
    await window.electron.deletePlugin(pathPrefix);
    await renderPlugins(); // 刷新插件列表
  } catch (error) {
    console.error('删除插件错误:', error);
  }
}

async function renderPlugins() {
  const currentPluginsList = document.getElementById('currentPluginsList');
  currentPluginsList.innerHTML = '';

  const pluginInstanceMap = await window.electron.getPluginInstanceMap();
  for (const [pathPrefix, handlerConfig] of Object.entries(pluginInstanceMap)) {
    const li = document.createElement('li');
    li.className = 'plugin-item';
    li.innerHTML = `
      <div class="plugin-column">${pathPrefix}</div>
      <div class="plugin-column">${JSON.stringify(handlerConfig)}</div>
      <div class="plugin-actions">
        <button class="edit-plugin" data-path-prefix="${pathPrefix}">修改配置</button>
        <button class="delete-plugin" data-path-prefix="${pathPrefix}">删除</button>
      </div>
    `;
    currentPluginsList.appendChild(li);
  }

  document.querySelectorAll('.edit-plugin').forEach(button => {
    button.addEventListener('click', (event) => {
      const pathPrefix = event.target.getAttribute('data-path-prefix');
      editPluginConfig(pathPrefix);
    });
  });

  document.querySelectorAll('.delete-plugin').forEach(button => {
    button.addEventListener('click', (event) => {
      const pathPrefix = event.target.getAttribute('data-path-prefix');
      deletePlugin(pathPrefix);
    });
  });
}