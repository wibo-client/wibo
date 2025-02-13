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
    this.setupContextMenuHandler();
    this.setupGlobalFaqListener();
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
      if (currentScrollTop < lastScrollTop && currentScrollTop <= 0 && !this.loadingHistory) {
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
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        if (url) {
          await this.handleLinkClick(url);
        }
      });
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
    messageGroup.setAttribute('data-message-id', messageData.id); // 改用 id 而不是 timestamp
    // 添加path信息到data属性
    messageGroup.setAttribute('data-path', messageData.path || '');

    // 如果存在原始markdown内容，在相应message元素内部创建hidden元素
    if (messageData.markdown) {
      const messageElement = document.createElement('div');
      messageElement.className = 'message wiba';

      const hiddenMarkdown = document.createElement('div');
      hiddenMarkdown.className = 'original-markdown';
      hiddenMarkdown.style.display = 'none';
      hiddenMarkdown.textContent = messageData.markdown;

      messageElement.appendChild(hiddenMarkdown);
      messageElement.innerHTML += marked(messageData.markdown);
      messageGroup.appendChild(messageElement);
    } else {
      messageGroup.innerHTML = messageData.html;
    }

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
          typeSelect.value = 'quickSearch';
          this.sendMessage();
        } else if (event.altKey) {
          // Alt + Enter: 深问
          event.preventDefault();
          typeSelect.value = 'deepSearch';
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
      const messageId = uuidv4(); // 使用UUID替代timestamp
      messageGroup.setAttribute('data-message-id', messageId);  // 使用data-message-id属性
      // 添加path到data属性
      messageGroup.setAttribute('data-path', path);

      // 用户输入信息
      const userMessageElement = document.createElement('div');
      userMessageElement.className = 'message user';
      const userMarkdown = "### 你 : \n\n" + message + "\n\n";
      const userHiddenMarkdown = document.createElement('div');
      userHiddenMarkdown.className = 'original-markdown';
      userHiddenMarkdown.style.display = 'none';
      userHiddenMarkdown.textContent = userMarkdown;
      userMessageElement.innerHTML = marked(userMarkdown);
      userMessageElement.appendChild(userHiddenMarkdown);
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
          <span class="system-stop">终止任务</span>
          <span class="system-faq">设为常问</span>
        </div>
      `;
      messageGroup.appendChild(systemMessageElement);

      const systemContent = systemMessageElement.querySelector('.system-content');
      const systemToggle = systemMessageElement.querySelector('.system-toggle');
      const systemStop = systemMessageElement.querySelector('.system-stop');

      // 添加终止任务的点击处理
      systemStop.addEventListener('click', async () => {
        try {
          const result = await window.electron.stopCurrentTask(requestId);
          systemContent.querySelector('.execution-log:last-child').textContent = `⏳ 终止命令已提交...`;

          if (!result.success) {
            console.error('终止任务失败:', result);
          }
        } catch (error) {
          console.error('终止任务请求失败:', error);
          // 可以选择向用户显示错误信息
          const errorMessage = error.message || '终止任务失败';
          systemContent.querySelector('.execution-log:last-child').textContent = `❌ ${errorMessage}`;
        }
      });

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
      const wibaHiddenMarkdown = document.createElement('div');
      wibaHiddenMarkdown.className = 'original-markdown';
      wibaHiddenMarkdown.style.display = 'none';
      wibaMessageElement.appendChild(wibaHiddenMarkdown); // 移动到message元素内部
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
        lastUpdateTime: 0, // 添加最后更新时间记录

        onChunk: (chunk) => {
          wholeMessage += chunk;
          // const currentTime = Date.now();
          // const messageLength = wholeMessage.length;

          // 确定更新间隔
          // 短消息(<200字符)时实时更新,长消息时降低更新频率
          // const updateInterval = messageLength < 1000 ? 0 : 6000; // 250ms = 1/4秒

          // 检查是否应该更新
          // if (currentTime - requestContext.lastUpdateTime >= updateInterval) {
          wibaMessageElement.innerHTML = marked(wholeMessage);
          wibaHiddenMarkdown.textContent = wholeMessage;
          wibaMessageElement.appendChild(wibaHiddenMarkdown); // 确保hidden元素始终在message内部

          // 为 WIBO 消息中的链接添加点击处理
          this.setupLinks(wibaMessageElement);

          // 更新最后更新时间
          requestContext.lastUpdateTime = currentTime;
          // }
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

          // 构建完整内容
          let fullContent = '### 参考文档\n\n';
          referenceData.fullContent.forEach(doc => {
            const encodedUrl = encodeURI(doc.url);
            fullContent += `${doc.index}. [${doc.title}](${encodedUrl})\n`;
            if (doc.date) {
              fullContent += `   日期: ${doc.date}\n`;
            }
            fullContent += `   描述: ${doc.description || doc.summary || '暂无描述'}\n\n`;
          });

          // 存储原始 Markdown
          const referenceHiddenMarkdown = document.createElement('div');
          referenceHiddenMarkdown.className = 'original-markdown';
          referenceHiddenMarkdown.style.display = 'none';
          referenceHiddenMarkdown.textContent = fullContent;

          referenceMessageElement.innerHTML = `
            <div class="reference-full-content">

              ${marked(fullContent)}
            </div>
            <div class="reference-actions">
              <a href="#" class="reference-toggle">展开更多参考(${referenceData.fullContent.length})</a>
            </div>
          `;

          referenceMessageElement.appendChild(referenceHiddenMarkdown);
          wiboContainer.appendChild(referenceMessageElement);

          // 修改链接处理逻辑
          referenceMessageElement.addEventListener('click', async (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            e.preventDefault();
            const url = link.getAttribute('href');

            // 检查是否是展开/折叠按钮
            if (link.classList.contains('reference-toggle')) {
              const fullContentElement = referenceMessageElement.querySelector('.reference-full-content');
              fullContentElement.classList.toggle('expanded');

              if (fullContentElement.classList.contains('expanded')) {
                link.textContent = '收起参考';
              } else {
                link.textContent = `展开更多参考(${referenceData.fullContent.length})`;
              }
              return;
            }

            // 使用统一的链接处理方法
            if (url) {
              await this.handleLinkClick(url);
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
        id: messageId,  // 添加UUID作为消息ID
        timestamp: Date.now(),  // 保留timestamp用于显示时间
        type: type,
        path: path,  // 确保path被包含在messageData中
        html: messageGroup.innerHTML
      };

      const savedMessage = await window.electron.chatHistory.saveMessage(messageData);

      // 如果后端返回了新的ID,更新DOM元素的ID
      if (savedMessage && savedMessage.id !== messageId) {
        messageGroup.setAttribute('data-message-id', savedMessage.id);
      }

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

  setupContextMenuHandler() {
    // 监听右键菜单命令
    window.electron.onContextMenuCommand(async (command, elementInfo) => {
      switch (command) {
        case 'copy-as-markdown':
          if (elementInfo.x && elementInfo.y) {
            // 获取所有消息组
            const messageGroups = document.querySelectorAll('.message-group');
            let nearestDistance = Infinity;
            let nearestMarkdown = null;

            // 遍历所有消息组
            messageGroups.forEach(group => {
              // 获取组内的 original-markdown 元素
              const markdowns = group.querySelectorAll('.original-markdown');

              markdowns.forEach(markdown => {
                const parentMessage = markdown.closest('.message');
                if (!parentMessage) return;

                const rect = parentMessage.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const distance = Math.sqrt(
                  Math.pow(centerX - elementInfo.x, 2) +
                  Math.pow(centerY - elementInfo.y, 2)
                );

                if (distance < nearestDistance) {
                  nearestDistance = distance;
                  nearestMarkdown = markdown;
                }
              });
            });

            // 如果找到最近的 Markdown，使用 IPC 复制其内容
            if (nearestMarkdown) {
              const markdownContent = nearestMarkdown.textContent;
              try {
                await window.electron.clipboard.writeText(markdownContent);

                // 显示复制成功提示
                const messageElement = nearestMarkdown.closest('.message');
                if (messageElement) {
                  const notification = document.createElement('div');
                  notification.className = 'copy-notification';
                  notification.textContent = '✓ Markdown已复制';
                  notification.style.position = 'absolute';
                  notification.style.right = '10px';
                  notification.style.top = '10px';
                  notification.style.background = 'rgba(0, 0, 0, 0.7)';
                  notification.style.color = 'white';
                  notification.style.padding = '5px 10px';
                  notification.style.borderRadius = '4px';
                  notification.style.zIndex = '1000';
                  notification.style.opacity = '1';
                  notification.style.transition = 'opacity 0.5s ease-in-out';

                  messageElement.style.position = 'relative';
                  messageElement.appendChild(notification);

                  // 2秒后淡出并移除通知
                  setTimeout(() => {
                    notification.style.opacity = '0';
                    setTimeout(() => notification.remove(), 500);
                  }, 2000);
                }
              } catch (error) {
                console.error('复制 Markdown 失败:', error);
              }
            }
          }
          break;

        case 'delete-current-message':
          let selectedMessage = document.querySelector('.message-group.selected');

          // 如果没有选中的消息，尝试通过坐标找到最近的消息组
          if (!selectedMessage && elementInfo.x && elementInfo.y) {
            // 获取所有消息组
            const messageGroups = document.querySelectorAll('.message-group');

            // 计算每个消息组中心点到鼠标的距离
            let nearestDistance = Infinity;
            let nearestElement = null;

            messageGroups.forEach(group => {
              const rect = group.getBoundingClientRect();
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;

              // 计算欧几里得距离
              const distance = Math.sqrt(
                Math.pow(centerX - elementInfo.x, 2) +
                Math.pow(centerY - elementInfo.y, 2)
              );

              if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestElement = group;
              }
            });

            // 如果找到最近的元素，将其设置为选中状态
            if (nearestElement) {
              // 移除其他消息的选中状态
              document.querySelectorAll('.message-group.selected').forEach(el => {
                el.classList.remove('selected');
              });
              // 为最近的消息添加选中状态
              nearestElement.classList.add('selected');
              selectedMessage = nearestElement;
            }
          }

          // 处理选中的消息
          if (selectedMessage) {
            const messageId = selectedMessage.getAttribute('data-message-id');
            if (messageId) {
              await this.deleteMessage(messageId);
              selectedMessage.remove();
            }
          }
          break;

        case 'clear-all-messages':
          if (confirm('确定要清空所有对话记录吗？')) {
            await this.clearAllMessages();
          }
          break;
      }
    });

    // 添加消息选中状态处理
    document.getElementById('messages').addEventListener('click', (e) => {
      const messageGroup = e.target.closest('.message-group');
      if (messageGroup) {
        // 移除其他消息的选中状态
        document.querySelectorAll('.message-group.selected').forEach(el => {
          el.classList.remove('selected');
        });
        // 为当前消息添加选中状态
        messageGroup.classList.add('selected');
      }
    });
  }

  async deleteMessage(messageId) {
    try {
      await window.electron.chatHistory.deleteMessage(messageId);
      const element = document.querySelector(`[data-message-id="${messageId}"]`);
      if (element) {
        element.remove();
      }
    } catch (error) {
      console.error('删除消息失败:', error);
    }
  }

  async clearAllMessages() {
    try {
      await window.electron.chatHistory.clearAllMessages();
      const messagesContainer = document.getElementById('messages');
      messagesContainer.innerHTML = '';
    } catch (error) {
      console.error('清空消息失败:', error);
    }
  }

  // 添加新方法处理全局FAQ点击
  setupGlobalFaqListener() {
    document.getElementById('messages').addEventListener('click', async (e) => {
      if (e.target.classList.contains('system-faq')) {
        const messageGroup = e.target.closest('.message-group');
        if (!messageGroup) return;

        const userMessage = messageGroup.querySelector('.message.user');
        if (!userMessage) return;

        const message = userMessage.textContent.replace(/^### 你 : /, '').trim();
        // 从data属性获取path
        const path = messageGroup.getAttribute('data-path');

        if (!path) {
          console.error('未找到目录路径信息');
          const systemContent = e.target.closest('.message.system').querySelector('.system-content');
          const logElement = document.createElement('div');
          logElement.className = 'execution-log';
          logElement.textContent = '❌ 未找到目录路径信息，无法设置常问问题';
          systemContent.appendChild(logElement);
          return;
        }

        const systemContent = e.target.closest('.message.system').querySelector('.system-content');

        try {
          const taskData = {
            directoryPath: path,
            keyQuestion: message
          };

          await window.refineryHandler.addRefineryTask(taskData);

          const logElement = document.createElement('div');
          logElement.className = 'execution-log';
          logElement.textContent = '✅ 已成功设置为常问问题';
          systemContent.appendChild(logElement);
        } catch (error) {
          console.error('设置常问问题失败:', error);
          const errorMessage = error.message || '设置常问问题失败';

          const logElement = document.createElement('div');
          logElement.className = 'execution-log';
          logElement.textContent = `❌ ${errorMessage}`;
          systemContent.appendChild(logElement);
        }
      }
    });
  }

  // 添加新的链接处理方法
  setupLinks(container) {
    container.querySelectorAll('a').forEach(link => {

      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const url = link.getAttribute('href');
        if (url) {
          await this.handleLinkClick(url);
        }
      });
      link.setAttribute('data-handled', 'true');
    });
  }

  isLocalPath(url) {
    // 检查是否是绝对路径 (Windows 或 Unix 风格)
    return /^([a-zA-Z]:\\|\\\\|\/)/.test(url);
  }

  async handleLinkClick(url) {
    try {
      if (this.isLocalPath(url)) {
        // 对于本地路径,打开所在目录
        await window.electron.shell.showItemInFolder(url);
      } else if (!url.startsWith('#')) {
        // 对于外部链接,使用默认浏览器打开
        await window.electron.shell.openExternal(url);
      }
    } catch (error) {
      console.error('打开链接失败:', error);
      // 可以添加错误提示
      const errorMessage = this.isLocalPath(url) ? '打开文件目录失败' : '打开链接失败';
      console.error(`${errorMessage}:`, error);
    }
  }

}
