import AuthClass from './auth/auth.mjs';
import { marked } from 'marked'; // 从 npm 包中导入 marked
import ChatHandler from './rendererModules/chat/chatHandler.mjs';
import KnowledgeBaseHandler from './rendererModules/knowledge/knowledgeBaseHandler.mjs';
import BrowserConfigHandler from './rendererModules/browser/browserConfigHandler.mjs';
import QuickNavigationHandler from './rendererModules/navigation/quickNavigationHandler.mjs';
import LogViewerHandler from './rendererModules/logs/logViewerHandler.mjs';
import RefineryHandler from './rendererModules/refinery/refineryHandler.mjs'; // 新增
import KnowledgeLocalServerStatusHandler from './rendererModules/knowledge/knowledgeLocalServerStatusHandler.mjs';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM 加载完成');

  // 初始化各个模块
  const chatHandler = new ChatHandler();
  const browserConfigHandler = new BrowserConfigHandler();
  const quickNavigationHandler = new QuickNavigationHandler();
  const logViewerHandler = new LogViewerHandler(); // 添加日志查看器模块
  const refineryHandler = new RefineryHandler(); // 新增知识精炼处理器

  // 将 refineryHandler 添加到 window 对象中，使其他模块可以访问
  window.refineryHandler = refineryHandler;

  const knowledgeBaseHandler = new KnowledgeBaseHandler();
  const knowledgeLocalServerStatusHandler = new KnowledgeLocalServerStatusHandler();
  // 添加定期检查服务状态
  knowledgeBaseHandler.init(knowledgeLocalServerStatusHandler);
  refineryHandler.init(knowledgeLocalServerStatusHandler); // 新增

  setupTabSwitching();

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

  const selectedTab = document.querySelector(`.tab[data-tab="${tabName}"]`);
  const selectedContent = document.getElementById(tabName);

  if (selectedTab && selectedContent) {
    selectedTab.classList.add('active');
    selectedContent.classList.add('active');
  }
}