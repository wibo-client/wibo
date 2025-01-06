import AuthClass from './auth/auth.mjs';
import { marked } from 'marked'; // 从 npm 包中导入 marked
import ConfigKeys from './config/configKeys.mjs'; // 引入共享的配置枚举值

const BASE_URL = 'http://localhost:8080'; // 设置本地服务的 URL

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM 加载完成');
  await loadConfigValues(); // 加载配置值
  setupEventListeners();
  setupLinkHandler(); // 添加链接处理器
  renderPlugins(); // 初始化插件列表
  initLocalKnowledgeBase(); // 初始化本地知识库
  setupTabSwitching();
  setupAutoResizeInput();
});

// 删除与登录和注册相关的函数
// async function handleLogin() {
//   const username = document.getElementById('username').value;
//   const password = document.getElementById('password').value;
//   const apiEndpoint = await window.electron.getConfig('apiEndpoint') || API_ENDING_POINT_DEFAULT;
//   const auth = new AuthClass(apiEndpoint);

//   const success = await auth.login(username, password);
//   if (success) {
//     document.querySelector('.tab[data-tab="interaction"]').click();
//   }
// }

// async function handleRegister() {
//   const username = document.getElementById('regUsername').value;
//   const password = document.getElementById('regPassword').value;
//   const apiEndpoint = await window.electron.getConfig('apiEndpoint') || API_ENDING_POINT_DEFAULT;
//   const auth = new AuthClass(apiEndpoint);

//   const success = await auth.register(username, password);
//   if (success) {
//     switchToTab('login');
//   }
// }

function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
}

function setupEventListeners() {
  // 删除与登录和注册相关的事件监听器
  // document.getElementById('loginButton').addEventListener('click', handleLogin);
  // document.getElementById('submitRegisterButton').addEventListener('click', handleRegister);
  // document.getElementById('registerButton').addEventListener('click', () => switchToTab('register'));
  // document.getElementById('cancelRegisterButton').addEventListener('click', () => switchToTab('login'));

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

  document.getElementById('saveConfigButton').addEventListener('click', handleSaveConfig);
  document.getElementById('saveBrowserConfigButton').addEventListener('click', handleSaveConfig); // 新增事件监听器

  // 本地知识库相关事件监听器
  const localKnowledgeBaseToggle = document.getElementById('localKnowledgeBaseToggle');
  const remoteUploadToggle = document.getElementById('remoteUploadToggle');
  const submitLocalDirectoryBtn = document.getElementById('submitLocalDirectory');
  const preRecognizeImagesToggle = document.getElementById('preRecognizeImages');
  const preRecognizePDFsToggle = document.getElementById('preRecognizePDFs');
  const preRecognizePPTsToggle = document.getElementById('preRecognizePPTs');

  if (localKnowledgeBaseToggle) {
    localKnowledgeBaseToggle.addEventListener('change', toggleLocalKnowledgeBase);
  }
  if (remoteUploadToggle) {
    remoteUploadToggle.addEventListener('change', toggleRemoteUpload);
  }
  if (submitLocalDirectoryBtn) {
    submitLocalDirectoryBtn.addEventListener('click', submitLocalDirectory);
  }

  // 添加模型增强开关的事件监听
  const handleModelEnhancement = () => {
    const config = {
      enableImageRecognition: preRecognizeImagesToggle?.checked || false,
      enablePdfRecognition: preRecognizePDFsToggle?.checked || false,
      enablePptRecognition: preRecognizePPTsToggle?.checked || false
    };

    fetch(`${BASE_URL}/admin/toggle-model-enhancement`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(config)
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        alert(data.message);
      }
    })
    .catch(error => {
      alert('操作失败: ' + error.message);
    });
  };

  if (preRecognizeImagesToggle) {
    preRecognizeImagesToggle.addEventListener('change', handleModelEnhancement);
  }
  if (preRecognizePDFsToggle) {
    preRecognizePDFsToggle.addEventListener('change', handleModelEnhancement);
  }
  if (preRecognizePPTsToggle) {
    preRecognizePPTsToggle.addEventListener('change', handleModelEnhancement);
  }
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
  const typeSelect = document.getElementById('typeSelect');

  if (!sendButton || !chatInput || !typeSelect) {
    console.error('sendButton, chatInput, or typeSelect is null');
    return;
  }

  sendButton.addEventListener('click', sendMessage);
  chatInput.addEventListener('keydown', (event) => {
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault();
      if (typeSelect.value === 'searchAndChat' || typeSelect.value === 'search') {
        sendMessage();
      }
    } else if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault();
      if (typeSelect.value === 'searchWithRerank' || typeSelect.value === 'chat') {
        sendMessage();
      }
    } else if (event.shiftKey && event.key === '\\') {
      event.preventDefault();
      typeSelect.value = 'search';
      sendMessage();
    } else if (event.ctrlKey && event.key === '\\') {
      event.preventDefault();
      typeSelect.value = 'chat';
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
  const executeInForeground = document.getElementById('executeInForeground').checked;

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
    window.electron.sendMessage(message, type, path, requestContext, executeInForeground);
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

  if (!pathInput || !pathDropdown) {
    console.error('pathInput or pathDropdown is null');
    return;
  }

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

async function handleSaveConfig() {
  const modelSK = document.getElementById('accessKey')?.value;
  if (modelSK) {
    const maskedSK = maskSK(modelSK);
    document.getElementById('masked-ak').textContent = `当前AK: ${maskedSK}`;
    document.getElementById('accessKey').value = '';
  }
  
  const browserTimeout = document.getElementById(ConfigKeys.BROWSER_TIMEOUT)?.value;
  const browserConcurrency = document.getElementById(ConfigKeys.BROWSER_CONCURRENCY)?.value;
  const headless = document.getElementById(ConfigKeys.HEADLESS)?.value;
  const pageFetchLimit = document.getElementById(ConfigKeys.PAGE_FETCH_LIMIT)?.value;

  const config = {
    [ConfigKeys.MODEL_SK]: modelSK,
    [ConfigKeys.BROWSER_TIMEOUT]: browserTimeout,
    [ConfigKeys.BROWSER_CONCURRENCY]: browserConcurrency,
    [ConfigKeys.HEADLESS]: headless,
    [ConfigKeys.PAGE_FETCH_LIMIT]: pageFetchLimit
  };

  await window.electron.setConfig('appGlobalConfig', JSON.stringify(config));

  alert('配置已保存');
  await loadConfigValues();
  await window.electron.reinitialize();
}

function maskSK(sk) {
  if (sk.length <= 10) return sk;
  return sk.substring(0, 5) + '*'.repeat(sk.length - 10) + sk.slice(-5);
}

async function loadConfigValues() {
  const configJson = await window.electron.getConfig('appGlobalConfig');
  if (configJson) {
    const config = JSON.parse(configJson);
    if (config[ConfigKeys.MODEL_SK]) {
      const maskedSK = maskSK(config[ConfigKeys.MODEL_SK]);
      document.getElementById('masked-ak').textContent = `当前AK: ${maskedSK}`;
    }
    if (config[ConfigKeys.BROWSER_TIMEOUT]) document.getElementById(ConfigKeys.BROWSER_TIMEOUT).value = config[ConfigKeys.BROWSER_TIMEOUT];
    if (config[ConfigKeys.BROWSER_CONCURRENCY]) document.getElementById(ConfigKeys.BROWSER_CONCURRENCY).value = config[ConfigKeys.BROWSER_CONCURRENCY];
    if (config[ConfigKeys.HEADLESS]) document.getElementById(ConfigKeys.HEADLESS).value = config[ConfigKeys.HEADLESS];
    if (config[ConfigKeys.PAGE_FETCH_LIMIT]) document.getElementById(ConfigKeys.PAGE_FETCH_LIMIT).value = config[ConfigKeys.PAGE_FETCH_LIMIT];
  }
}

// 本地知识库相关函数
function toggleLocalKnowledgeBase() {
  const configSection = document.getElementById('localKnowledgeBaseConfig');
  if (configSection) {
    configSection.style.display = this.checked ? 'block' : 'none';
  }
}

function toggleRemoteUpload() {
  const configSection = document.getElementById('remoteUploadConfig');
  if (configSection) {
    configSection.style.display = this.checked ? 'block' : 'none';
    
    // 发送状态到后端
    fetch(`${BASE_URL}/admin/toggle-remote-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ enable: this.checked })
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        alert(data.message);
        this.checked = !this.checked;
        configSection.style.display = !this.checked ? 'block' : 'none';
      }
    })
    .catch(error => {
      alert('操作失败: ' + error.message);
      this.checked = !this.checked;
      configSection.style.display = !this.checked ? 'block' : 'none';
    });
  }
}

async function submitLocalDirectory() {
  const directory = document.getElementById('localDirectory').value;
  if (!directory) {
    alert('请输入文件路径');
    return;
  }

  try {
    const response = await fetch(`${BASE_URL}/admin/submit/path`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: directory })
    });
    const data = await response.json();
    if (data.success) {
      document.getElementById('localDirectory').value = '';
      updateMonitoredDirs();
    }
    alert(data.message);
  } catch (error) {
    alert('提交失败: ' + error.message);
  }
}

async function updateMonitoredDirs() {
  try {
    const response = await fetch(`${BASE_URL}/admin/list/monitored-dirs`);
    const data = await response.json();
    const tbody = document.getElementById('directoryTableBody');
    tbody.innerHTML = '';
    data.forEach(dir => {
      const row = tbody.insertRow();
      row.insertCell(0).textContent = dir.path;
      row.insertCell(1).textContent = dir.fileCount;
      row.insertCell(2).textContent = dir.completedCount;
      row.insertCell(3).textContent = dir.completionRate;
      const deleteButton = document.createElement('button');
      deleteButton.textContent = '删除';
      deleteButton.onclick = () => deleteMonitoredDir(dir.path);
      row.insertCell(4).appendChild(deleteButton);
    });
  } catch (error) {
    console.error('获取监控目录列表失败:', error);
  }
}

async function deleteMonitoredDir(path) {
  if (confirm('确定要删除该监控目录吗？')) {
    try {
      const response = await fetch(`${BASE_URL}/admin/delete/monitored-dir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ path: path })
      });
      const data = await response.json();
      if (data.success) {
        updateMonitoredDirs(); // 刷新列表
      }
      alert(data.message);
    } catch (error) {
      alert('删除失败: ' + error.message);
    }
  }
}

function initLocalKnowledgeBase() {
  // 初始化函数
  updateMonitoredDirs();
  setInterval(updateMonitoredDirs, 10000); // 每隔10秒刷新一次监控目录列表

  // 获取模型增强状态
  fetch(`${BASE_URL}/admin/get-model-enhancement-status`)
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        const preRecognizeImagesToggle = document.getElementById('preRecognizeImages');
        const preRecognizePDFsToggle = document.getElementById('preRecognizePDFs');
        const preRecognizePPTsToggle = document.getElementById('preRecognizePPTs');

        if (preRecognizeImagesToggle) preRecognizeImagesToggle.checked = data.imageRecognitionEnabled;
        if (preRecognizePDFsToggle) preRecognizePDFsToggle.checked = data.pdfRecognitionEnabled;
        if (preRecognizePPTsToggle) preRecognizePPTsToggle.checked = data.pptRecognitionEnabled;
      }
    })
    .catch(error => {
      console.error('获取模型增强状态失败:', error);
    });
}

function setupAutoResizeInput() {
  const userInput = document.getElementById('user-input');
  userInput.addEventListener('input', () => {
    userInput.style.height = 'auto';
    userInput.style.height = `${Math.min(userInput.scrollHeight, 150)}px`;
  });
}