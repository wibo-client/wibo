import AuthClass from './auth/auth.mjs';
import { marked } from 'marked'; // 从 npm 包中导入 marked
import ConfigKeys from './config/configKeys.mjs'; // 引入共享的配置枚举值
import ChatHandler from './modules/chat/chatHandler.mjs';
import KnowledgeBaseHandler from './modules/knowledge/knowledgeBaseHandler.mjs';
import BrowserConfigHandler from './modules/browser/browserConfigHandler.mjs';

const BASE_URL = 'http://localhost:8080'; // 设置本地服务的 URL

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM 加载完成');
  
  // 初始化各个模块
  const chatHandler = new ChatHandler();
  const knowledgeBaseHandler = new KnowledgeBaseHandler(BASE_URL);
  const browserConfigHandler = new BrowserConfigHandler();
  setupTabSwitching();
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