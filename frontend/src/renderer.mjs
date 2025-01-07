import AuthClass from './auth/auth.mjs';
import { marked } from 'marked'; // 从 npm 包中导入 marked
import ConfigKeys from './config/configKeys.mjs'; // 引入共享的配置枚举值
import ChatHandler from './rendererModules/chat/chatHandler.mjs';
import KnowledgeBaseHandler from './rendererModules/knowledge/knowledgeBaseHandler.mjs';
import BrowserConfigHandler from './rendererModules/browser/browserConfigHandler.mjs';

const BASE_URL = 'http://localhost:8080'; // 设置本地服务的 URL

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM 加载完成');
  
  // 初始化各个模块
  const chatHandler = new ChatHandler();
  const knowledgeBaseHandler = new KnowledgeBaseHandler();
  const browserConfigHandler = new BrowserConfigHandler();
  setupTabSwitching();

  // 添加定期检查服务状态
  checkServerStatus();
  setInterval(checkServerStatus, 5000);

  // 添加快捷导航点击处理
  document.querySelectorAll('.quick-link-item').forEach(item => {
    item.addEventListener('click', () => {
      const path = item.dataset.path;
      const pathInput = document.getElementById('pathInput');
      const userInput = document.getElementById('user-input');
      
      // 设置路径并切换到对话标签页
      pathInput.value = path;
      switchToTab('interaction');
      userInput.focus();
    });
  });

  // 添加快捷导航内容加载
  setupQuickNavigation();
});

// 只保留基础功能和模块初始化相关代码
function setupTabSwitching() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchToTab(tab.getAttribute('data-tab'));
    });
  });
}

function switchToTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');
}

// 添加服务状态检查函数
async function checkServerStatus() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const processPid = document.getElementById('processPid');
  const processPort = document.getElementById('processPort');

  try {
    const serverStatus = await electron.getServerDesiredState();
    //console.log('Server status:', serverStatus); // 添加调试日志

    if (serverStatus.isHealthy && serverStatus.pid && serverStatus.port) {
      statusDot.classList.remove('offline');
      statusDot.classList.add('online');
      statusText.textContent = '在线';
      processPid.textContent = serverStatus.pid;
      processPort.textContent = serverStatus.port;
    } else {
      statusDot.classList.remove('online');
      statusDot.classList.add('offline');
      statusText.textContent = '离线';
      processPid.textContent = '-';
      processPort.textContent = '-';
     // console.log('Server not healthy:', serverStatus); // 添加调试日志
    }
  } catch (error) {
    console.error('服务状态检查失败:', error);
    statusDot.classList.remove('online');
    statusDot.classList.add('offline');
    statusText.textContent = '检查失败';
    processPid.textContent = '-';
    processPort.textContent = '-';
  }
}

// 添加快捷导航内容加载函数
async function setupQuickNavigation() {
  try {
    // 获取插件实例映射
    const pluginMap = await electron.getPluginInstanceMap();
    const container = document.getElementById('quickLinksContainer');
    
    if (!container) return;
    
    // 清空现有内容
    container.innerHTML = '';
    
    // 为每个插件创建快捷导航项
    for (const [pathPrefix, plugin] of Object.entries(pluginMap)) {
      const linkItem = document.createElement('div');
      linkItem.className = 'quick-link-item';
      linkItem.dataset.path = pathPrefix;
      
      const textSpan = document.createElement('span');
      textSpan.className = 'quick-link-text';
      textSpan.textContent = plugin.name || pathPrefix;
      
      linkItem.appendChild(textSpan);
      container.appendChild(linkItem);
      
      // 添加点击事件
      linkItem.addEventListener('click', () => {
        const pathInput = document.getElementById('pathInput');
        const userInput = document.getElementById('user-input');
        
        pathInput.value = pathPrefix;
        switchToTab('interaction');
        userInput.focus();
      });
    }
  } catch (error) {
    console.error('Failed to load quick navigation:', error);
  }
}