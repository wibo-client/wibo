import { marked } from 'marked';
import { v4 as uuidv4 } from 'uuid'; // 添加导入

export default class ChatHandler {
  constructor() {
    this.setupMessageHooks();
    this.setupAutoResizeInput();
    this.setupPathInput();
    this.currentOffset = 0;
    this.loadingHistory = false;
    this.setupScrollHandler();
    this.loadInitialHistory();
    this.inputHistory = [];           // 添加输入历史数组
    this.historyIndex = -1;          // 添加历史索引
    this.currentInput = '';          // 添加当前输入缓存
  }

  async loadInitialHistory() {
    try {
      const feedbackBox = document.getElementById('messages');
      const messages = await window.electron.chatHistory.getMessages(0, 5);

      if (messages.length > 0) {
        // 添加历史记录分隔符
        const divider = document.createElement('div');
        divider.className = 'history-divider';
        divider.textContent = '历史消息';
        feedbackBox.appendChild(divider);

        messages.forEach(msg => {
          const messageGroup = this.createMessageGroupFromData(msg);
          messageGroup.classList.add('history');
          feedbackBox.appendChild(messageGroup);
        });

        // 添加链接处理
        this.setupHistoryLinks(feedbackBox);

        // 添加延时以确保DOM更新后再滚动
        setTimeout(() => {
          feedbackBox.scrollTop = feedbackBox.scrollHeight;
        }, 100);
      }
    } catch (error) {
      console.error('加载历史记录失败:', error);
    }
  }

  setupScrollHandler() {
    const feedbackBox = document.getElementById('messages');
    let lastScrollTop = 0;

    feedbackBox.addEventListener('scroll', async () => {
      const currentScrollTop = feedbackBox.scrollTop;

      // 检测是否向上滚动到接近顶部
      if (currentScrollTop < lastScrollTop && currentScrollTop < 100 && !this.loadingHistory) {
        await this.loadMoreHistory(feedbackBox);
      }

      lastScrollTop = currentScrollTop;
    });
  }

  async loadMoreHistory(feedbackBox) {
    try {
      this.loadingHistory = true;

      // 添加加载提示
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-history';
      loadingIndicator.textContent = '加载更多历史记录...';
      feedbackBox.insertBefore(loadingIndicator, feedbackBox.firstChild);

      this.currentOffset += 5;
      const messages = await window.electron.chatHistory.getMessages(this.currentOffset, 5);

      // 记录原始高度
      const originalHeight = feedbackBox.scrollHeight;

      // 移除加载提示
      loadingIndicator.remove();

      if (messages.length > 0) {
        messages.reverse().forEach(msg => {
          const messageGroup = this.createMessageGroupFromData(msg);
          messageGroup.classList.add('history');
          feedbackBox.insertBefore(messageGroup, feedbackBox.firstChild);
        });

        // 添加时间分隔线
        const divider = document.createElement('div');
        divider.className = 'history-divider';
        divider.textContent = this.formatHistoryDate(messages[0].timestamp);
        feedbackBox.insertBefore(divider, feedbackBox.firstChild);

        // 设置滚动位置以保持视图稳定
        feedbackBox.scrollTop = feedbackBox.scrollHeight - originalHeight;

        // 处理新加载消息中的链接
        this.setupHistoryLinks(feedbackBox);
      }
    } catch (error) {
      console.error('加载更多历史记录失败:', error);
    } finally {
      this.loadingHistory = false;
    }
  }

  formatHistoryDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return '今天';
    } else if (diffDays === 1) {
      return '昨天';
    } else if (diffDays < 7) {
      return `${diffDays}天前`;
    } else {
      return date.toLocaleDateString();
    }
  }

  setupHistoryLinks(container) {
    container.querySelectorAll('a').forEach(link => {
      if (!link.hasAttribute('data-handled')) {
        link.addEventListener('click', async (e) => {
          e.preventDefault();
          const url = link.getAttribute('href');
          if (url && !url.startsWith('#')) {
            try {
              await window.electron.shell.openExternal(url);
            } catch (error) {
              console.error('打开链接失败:', error);
            }
          }
        });
        link.setAttribute('data-handled', 'true');
      }
    });
  }

  appendHistoricalMessage(messageData, prepend = false) {
    const messageGroup = this.createMessageGroupFromData(messageData);
    const feedbackBox = document.getElementById('messages');

    if (prepend && feedbackBox.firstChild) {
      feedbackBox.insertBefore(messageGroup, feedbackBox.firstChild);
    } else {
      feedbackBox.appendChild(messageGroup);
    }
  }

  createMessageGroupFromData(messageData) {
    const messageGroup = document.createElement('div');
    messageGroup.className = 'message-group';
    messageGroup.innerHTML = messageData.html;
    return messageGroup;
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
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();

        if (this.historyIndex === -1) {
          this.currentInput = chatInput.value;
        }

        if (event.key === 'ArrowUp') {
          if (this.historyIndex < this.inputHistory.length - 1) {
            this.historyIndex++;
            chatInput.value = this.inputHistory[this.historyIndex];
          }
        } else if (event.key === 'ArrowDown') {
          if (this.historyIndex > -1) {
            this.historyIndex--;
            chatInput.value = this.historyIndex === -1
              ? this.currentInput
              : this.inputHistory[this.historyIndex];
          }
        }

        // 将光标移到末尾
        setTimeout(() => {
          chatInput.selectionStart = chatInput.selectionEnd = chatInput.value.length;
        }, 0);

        // 触发输入事件以调整文本框高度
        const inputEvent = new Event('input');
        chatInput.dispatchEvent(inputEvent);
        return;
      }

      if (event.key === 'Enter') {
        if (event.shiftKey) {
          // Shift + Enter: 捡问
          event.preventDefault();
          typeSelect.value = 'searchAndChat';
          this.sendMessage();
        } else if (event.altKey) {
          // Alt + Enter: 深问
          event.preventDefault();
          typeSelect.value = 'highQuilityRAGChat';
          this.sendMessage();
        } else if (event.ctrlKey || event.metaKey) {
          // Ctrl + Enter 或 Cmd + Enter: 模型直答
          event.preventDefault();
          typeSelect.value = 'chat';
          this.sendMessage();
        }
      } else if ((event.ctrlKey || event.metaKey) && event.key === '\\') {
        // Ctrl + \ 或 Cmd + \: 搜索直出
        event.preventDefault();
        typeSelect.value = 'search';
        this.sendMessage();
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

    // 添加到输入历史
    this.inputHistory.unshift(message);
    if (this.inputHistory.length > 50) { // 限制历史记录数量
      this.inputHistory.pop();
    }
    this.historyIndex = -1;
    this.currentInput = '';

    try {
      const feedbackBox = document.getElementById('messages');

      // 创建消息组容器
      const messageGroup = document.createElement('div');
      messageGroup.className = 'message-group';

      // 用户输入信息
      const userMessageElement = document.createElement('div');
      userMessageElement.className = 'message user';
      userMessageElement.innerHTML = marked("### 你 : \n\n" + message + "\n\n");
      messageGroup.appendChild(userMessageElement);

      // 系统执行信息
      const systemMessageElement = document.createElement('div');
      systemMessageElement.className = 'message system';
      systemMessageElement.innerHTML = `
        <div class="system-content">
          <div class="execution-log">🔄 开始处理请求...</div>
        </div>
        <div class="system-actions">
          <span class="system-toggle">展开详情</span>
        </div>
      `;
      messageGroup.appendChild(systemMessageElement);

      const systemContent = systemMessageElement.querySelector('.system-content');
      const systemToggle = systemMessageElement.querySelector('.system-toggle');

      // 修改展开/折叠功能的绑定方式
      const toggleSystemContent = () => {
        systemContent.classList.toggle('expanded');
        const isExpanded = systemContent.classList.contains('expanded');
        systemToggle.textContent = isExpanded ? '收起详情' : '展开详情';

        // 控制日志显示
        const logs = systemContent.querySelectorAll('.execution-log');
        if (!isExpanded) {
          Array.from(logs).forEach((log, index) => {
            log.style.display = index < logs.length - 2 ? 'none' : 'block';
          });
        } else {
          logs.forEach(log => log.style.display = 'block');
        }
      };

      systemToggle.addEventListener('click', toggleSystemContent);

      // WIBO回复信息和引用信息容器
      const wiboContainer = document.createElement('div');
      wiboContainer.className = 'wibo-container';

      const wibaMessageElement = document.createElement('div');
      wibaMessageElement.className = 'message wiba';
      wibaMessageElement.innerHTML = '';
      wiboContainer.appendChild(wibaMessageElement);
      messageGroup.appendChild(wiboContainer);

      // 将整个消息组添加到反馈框
      feedbackBox.appendChild(messageGroup);

      // 自动滚动到底部
      feedbackBox.scrollTop = feedbackBox.scrollHeight;

      let wholeMessage = '### WIBO : \n\n';
      const requestId = uuidv4(); // 生成 UUID
      const requestContext = {
        requestId, // 传递生成的 UUID
        onChunk: (chunk) => {
          wholeMessage = chunk;
          wibaMessageElement.innerHTML = marked(wholeMessage);

          // 为 WIBO 消息中的链接添加点击处理
          wibaMessageElement.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', async (e) => {
              e.preventDefault();
              const url = link.getAttribute('href');
              if (url && !url.startsWith('#')) {
                try {
                  await window.electron.shell.openExternal(url);
                } catch (error) {
                  console.error('打开链接失败:', error);
                }
              }
            });
          });
        },
        onSystemLog: (log) => {
          const logElement = document.createElement('div');
          logElement.className = 'execution-log';
          logElement.textContent = log;

          // 将新日志添加到系统内容区域
          systemContent.appendChild(logElement);

          // 获取所有日志
          const logs = systemContent.querySelectorAll('.execution-log');

          // 如果不是展开状态，只显示最新的两条日志
          if (!systemContent.classList.contains('expanded')) {
            Array.from(logs).forEach((log, index) => {
              if (index < logs.length - 2) {
                log.style.display = 'none';
              } else {
                log.style.display = 'block';
              }
            });
          }
        },
        onReference: (referenceData) => {
          const referenceMessageElement = document.createElement('div');
          referenceMessageElement.className = 'message reference';

          // 构建初始显示内容（只显示第一条）
          let initialContent = '### 参考文档\n\n';
          if (referenceData.fullContent.length > 0) {
            const doc = referenceData.fullContent[0];
            initialContent += `1. [${doc.title}](${doc.url})\n`;
            if (doc.date) {
              initialContent += `   日期: ${doc.date}\n`;
            }
            initialContent += `   描述: ${doc.description}\n\n`;
          }

          // 构建完整内容
          let fullContent = '### 参考文档\n\n';
          referenceData.fullContent.forEach(doc => {
            fullContent += `${doc.index}. [${doc.title}](${doc.url})\n`;
            if (doc.date) {
              fullContent += `   日期: ${doc.date}\n`;
            }
            fullContent += `   描述: ${doc.description}\n\n`;
          });

          referenceMessageElement.innerHTML = `
            <div class="reference-content">
                ${marked(initialContent)}
            </div>
            <div class="reference-actions">
                <a href="#" class="reference-toggle">展开更多参考(${referenceData.fullContent.length})</a>
            </div>
            <div class="reference-full-content" style="display:none">
                ${marked(fullContent)}
            </div>
          `;

          // 将引用消息添加到同一个 wibo-container 中
          wiboContainer.appendChild(referenceMessageElement);

          // 修改链接处理逻辑
          referenceMessageElement.addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            e.preventDefault();
            const url = link.getAttribute('href');

            // 检查是否是展开/折叠按钮
            if (link.classList.contains('reference-toggle')) {
              const content = referenceMessageElement.querySelector('.reference-content');
              const fullContentElement = referenceMessageElement.querySelector('.reference-full-content');

              content.classList.toggle('expanded');
              if (content.classList.contains('expanded')) {
                content.innerHTML = fullContentElement.innerHTML;
                link.textContent = '收起参考';
              } else {
                content.innerHTML = marked(initialContent);
                link.textContent = `展开更多参考(${referenceData.fullContent.length})`;
              }
              return;
            }

            // 处理普通链接
            if (url && !url.startsWith('#')) {
              try {
                await window.electron.shell.openExternal(url);
              } catch (error) {
                console.error('打开链接失败:', error);
              }
            }
          });
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

      // 在创建消息组后，保存到历史记录
      const messageData = {
        timestamp: Date.now(),
        type: type,
        path: path,
        html: messageGroup.innerHTML
      };

      await window.electron.chatHistory.saveMessage(messageData);

    } catch (error) {
      console.error('发送消息错误:', error);
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
