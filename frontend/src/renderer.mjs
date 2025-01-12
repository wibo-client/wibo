import AuthClass from './auth/auth.mjs';
import { marked } from 'marked'; // 从 npm 包中导入 marked
import ChatHandler from './rendererModules/chat/chatHandler.mjs';
import KnowledgeBaseHandler from './rendererModules/knowledge/knowledgeBaseHandler.mjs';
import BrowserConfigHandler from './rendererModules/browser/browserConfigHandler.mjs';
import QuickNavigationHandler from './rendererModules/navigation/quickNavigationHandler.mjs';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM 加载完成');

  // 初始化各个模块
  const chatHandler = new ChatHandler();
  const knowledgeBaseHandler = new KnowledgeBaseHandler();
  const browserConfigHandler = new BrowserConfigHandler();
  const quickNavigationHandler = new QuickNavigationHandler();
  setupTabSwitching();

  // 添加定期检查服务状态
  knowledgeBaseHandler.startServerStatusCheck();

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
  quickNavigationHandler.setupQuickNavigation();
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