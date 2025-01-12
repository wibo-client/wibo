import { marked } from 'marked';

export default class ChatHandler {
  constructor() {
    this.setupMessageHooks();
    this.setupAutoResizeInput();
    this.setupPathInput();
  }

  async setupMessageHooks() {
    const sendButton = document.getElementById('send-message');
    const chatInput = document.getElementById('user-input');
    const typeSelect = document.getElementById('request-type');
    const foregroundExecution = document.getElementById('foregroundExecution');

    if (!sendButton || !chatInput || !typeSelect || !foregroundExecution) {
      console.error('Required chat elements not found:', {
        sendButton: !!sendButton,
        chatInput: !!chatInput,
        typeSelect: !!typeSelect,
        foregroundExecution: !!foregroundExecution
      });
      return;
    }

    // 添加对 foregroundExecution 的监听
    foregroundExecution.addEventListener('change', async (event) => {
      try {
        const globalConfig = await window.electron.getGlobalConfig();

        // 直接设置 headless 属性
        globalConfig.headless = event.target.checked;

        await window.electron.setGlobalConfig(globalConfig);
      } catch (error) {
        console.error('设置 headless 配置失败:', error);
      }
    });

    // 初始化复选框状态
    try {
      const globalConfig = await window.electron.getGlobalConfig();
      foregroundExecution.checked = globalConfig.headless;
    } catch (error) {
      console.error('获取 headless 配置失败:', error);
    }

    sendButton.addEventListener('click', () => this.sendMessage());
    this.setupKeyboardShortcuts(chatInput, typeSelect);
  }

  setupKeyboardShortcuts(chatInput, typeSelect) {
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        if (event.shiftKey) {
          // Shift + Enter: 捡问
          event.preventDefault();
          typeSelect.value = 'searchAndChat';
          this.sendMessage();
        } else if (event.altKey) {
          // Alt + Enter: 搜索直出
          event.preventDefault();
          typeSelect.value = 'search';
          this.sendMessage();
        } else if (event.ctrlKey || event.metaKey) {
          // Ctrl + Enter 或 Cmd + Enter: 模型直答
          event.preventDefault();
          typeSelect.value = 'chat';
          this.sendMessage();
        }
      } else if (event.key === '/') {
        // 当 user-input 为空时，将光标移动到 pathInput
        if (chatInput.value.trim() === '') {
          event.preventDefault();
          const pathInput = document.getElementById('pathInput');
          pathInput.focus();
          pathInput.value = '/';
        }
      }
    });

    // 自动调整输入框高度
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = chatInput.scrollHeight + 'px';
    });
  }

  setupAutoResizeInput() {
    const userInput = document.getElementById('user-input');
    if (!userInput) return;

    userInput.addEventListener('input', () => {
      // 重置高度以获取正确的 scrollHeight
      userInput.style.height = 'auto';

      // 计算行数（每行大约20px）
      const lineHeight = 20;
      const lines = Math.min(6, Math.ceil(userInput.scrollHeight / lineHeight));

      // 设置新的高度
      userInput.style.height = `${lines * lineHeight}px`;

      // 更新 rows 属性
      userInput.rows = lines;
    });
  }

  setupPathInput() {
    const pathInput = document.getElementById('pathInput');
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'path-suggestions';
    suggestionsContainer.style.display = 'none';
    pathInput.parentElement.style.position = 'relative';
    pathInput.parentElement.appendChild(suggestionsContainer);

    let debounceTimeout;

    const fetchSuggestions = async () => {
      const input = pathInput.value;
      try {
        await window.electron.fetchPathSuggestions(input);
      } catch (error) {
        console.error('获取路径建议失败:', error);
      }
    };

    // 输入处理
    pathInput.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(fetchSuggestions, 200);
    });

    // 当用户光标在 pathInput 框时获取后端建议
    pathInput.addEventListener('focus', fetchSuggestions);

    // 监听后端返回的建议
    window.electron.onPathSuggestions((suggestions) => {
      suggestionsContainer.innerHTML = '';

      if (suggestions.length > 0) {
        suggestions.forEach(suggestion => {
          const div = document.createElement('div');
          div.className = 'path-suggestion-item';
          div.textContent = suggestion;
          div.addEventListener('click', () => {
            pathInput.value = suggestion;
            suggestionsContainer.style.display = 'none';
          });
          suggestionsContainer.appendChild(div);
        });
        suggestionsContainer.style.display = 'block';
      } else {
        suggestionsContainer.style.display = 'none';
      }
    });

    // 处理建议框的显示隐藏
    document.addEventListener('click', (e) => {
      if (!pathInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
        suggestionsContainer.style.display = 'none';
      }
    });

    // 添加快捷键支持
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        pathInput.focus();
      }
    });

    // 处理建议项的键盘导航
    pathInput.addEventListener('keydown', (e) => {
      const items = suggestionsContainer.getElementsByClassName('path-suggestion-item');
      let activeIndex = Array.from(items).findIndex(item => item.classList.contains('hover'));

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (suggestionsContainer.style.display === 'none') {
            suggestionsContainer.style.display = 'block';
            activeIndex = -1;
          }
          if (activeIndex >= 0) {
            items[activeIndex].classList.remove('hover');
          }
          activeIndex = (activeIndex + 1) % items.length;
          items[activeIndex].classList.add('hover');
          items[activeIndex].scrollIntoView({ block: 'nearest' });
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (suggestionsContainer.style.display === 'none') {
            suggestionsContainer.style.display = 'block';
            activeIndex = items.length;
          }
          if (activeIndex >= 0) {
            items[activeIndex].classList.remove('hover');
          }
          activeIndex = (activeIndex - 1 + items.length) % items.length;
          items[activeIndex].classList.add('hover');
          items[activeIndex].scrollIntoView({ block: 'nearest' });
          break;

        case 'Enter':
          if (activeIndex >= 0) {
            e.preventDefault();
            pathInput.value = items[activeIndex].textContent;
            suggestionsContainer.style.display = 'none';
          }
          // 切换焦点到 user-input 并将光标移动到内容末尾
          const userInput = document.getElementById('user-input');
          userInput.focus();
          userInput.setSelectionRange(userInput.value.length, userInput.value.length);
          break;

        case 'Escape':
          suggestionsContainer.style.display = 'none';
          break;

        case 'Tab':
          if (items.length > 0) {
            e.preventDefault();
            pathInput.value = items[0].textContent;
            suggestionsContainer.style.display = 'none';
            // 切换焦点到 user-input 并将光标移动到内容末尾
            const userInput = document.getElementById('user-input');
            userInput.focus();
            userInput.setSelectionRange(userInput.value.length, userInput.value.length);
          }
          break;
      }
    });
  }

  async sendMessage() {
    const message = document.getElementById('user-input').value.trim();
    const type = document.getElementById('request-type').value;
    const path = document.getElementById('pathInput').value;

    if (!message) {
      return;
    }

    try {
      const feedbackBox = document.getElementById('messages');

      // 用户输入信息
      const userMessageElement = document.createElement('div');
      userMessageElement.className = 'message user';
      userMessageElement.innerHTML = marked("### 你 : \n\n" + message + "\n\n");
      feedbackBox.appendChild(userMessageElement);

      // 系统执行信息
      const systemMessageElement = document.createElement('div');
      systemMessageElement.className = 'message system';
      systemMessageElement.innerHTML = `
        <div class="system-content">
          <div class="execution-log">🔄 开始处理请求...</div>
        </div>
        <span class="system-toggle">展开详情</span>
      `;
      feedbackBox.appendChild(systemMessageElement);

      const systemContent = systemMessageElement.querySelector('.system-content');
      const systemToggle = systemMessageElement.querySelector('.system-toggle');

      // 添加展开/折叠功能
      systemToggle.addEventListener('click', () => {
        systemContent.classList.toggle('expanded');
        systemToggle.textContent = systemContent.classList.contains('expanded') ? '收起详情' : '展开详情';
      });

      // WIBO回复信息
      const wibaMessageElement = document.createElement('div');
      wibaMessageElement.className = 'message wiba';
      wibaMessageElement.innerHTML = '';
      feedbackBox.appendChild(wibaMessageElement);

      // 自动滚动到底部
      feedbackBox.scrollTop = feedbackBox.scrollHeight;
      
      let wholeMessage = '### WIBO : \n\n';

      const requestContext = {
        onChunk: (chunk) => {
          wholeMessage += chunk;
          wibaMessageElement.innerHTML = marked(wholeMessage);
        },
        onSystemLog: (log) => {
          const logElement = document.createElement('div');
          logElement.className = 'execution-log';
          logElement.textContent = log;
          systemContent.appendChild(logElement);
        }
      };

      // 清空输入框
      document.getElementById('user-input').value = '';

      await window.electron.sendMessage(
        message,
        type,
        path,
        requestContext
      );

    } catch (error) {
      console.error('发送消息错误:', error);
      alert('发送消息失败: ' + error.message);
    }
  }

  // 添加一个公共方法用于从外部重置聊天界面
  resetChat() {
    const feedbackBox = document.getElementById('feedbackBox');
    if (feedbackBox) {
      feedbackBox.innerHTML = '';
    }
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = '';
    }
  }
}
