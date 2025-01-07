import { marked } from 'marked';

export default class ChatHandler {
  constructor() {
    this.bindEvents();
    this.setupPathInput(); // 添加新方法
  }

  bindEvents() {
    // 等待DOM加载完成
    document.addEventListener('DOMContentLoaded', () => {
      this.setupMessageHooks();
      this.setupAutoResizeInput();
    });
  }

  setupMessageHooks() {
    // 修正元素ID以匹配HTML文件中的ID
    const sendButton = document.querySelector('#input-container button');  // 按钮没有id，用选择器
    const chatInput = document.getElementById('user-input');              // 改为 user-input
    const typeSelect = document.getElementById('request-type');          // 改为 request-type

    if (!sendButton || !chatInput || !typeSelect) {
      console.error('Required chat elements not found:', {
        sendButton: !!sendButton,
        chatInput: !!chatInput,
        typeSelect: !!typeSelect
      });
      return;
    }

    sendButton.addEventListener('click', () => this.sendMessage());
    this.setupKeyboardShortcuts(chatInput, typeSelect);
  }

  setupKeyboardShortcuts(chatInput, typeSelect) {
    chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        if (event.shiftKey) {
          // Shift + Enter: 插入换行
          return;
        } else {
          // 仅Enter: 发送消息
          event.preventDefault();
          this.sendMessage();
        }
      }
    });

    // 自动调整输入框高度
    chatInput.addEventListener('input', () => {
      chatInput.style.height = 'auto';
      chatInput.style.height = chatInput.scrollHeight + 'px';
    });

    chatInput.addEventListener('focus', () => {
      document.getElementById('pathDropdown').style.display = 'none';
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

  async sendMessage() {
    const message = document.getElementById('user-input').value;         // 改为 user-input
    const type = document.getElementById('request-type').value;         // 改为 request-type
    const path = document.getElementById('pathInput').value;
    const executeInForeground = document.getElementById('foregroundExecution').checked; // 改为 foregroundExecution

    try {
      const feedbackBox = document.getElementById('messages');          // 改为 messages
      
      // 用户输入信息
      const userMessageElement = document.createElement('div');
      userMessageElement.className = 'message user';
      userMessageElement.innerHTML = `你：<br><br>${message} <br><br><br>`;
      feedbackBox.appendChild(userMessageElement);

      // 清空用户输入框
      document.getElementById('user-input').value = '';                 // 改为 user-input

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
          wibaMessageElement.innerHTML = marked(wholeMessage);
          feedbackBox.scrollTop = feedbackBox.scrollHeight;
        }
      };

      await window.electron.sendMessage(
        message, 
        type, 
        path, 
        requestContext, 
        executeInForeground
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

  setupPathInput() {
    const pathInput = document.getElementById('pathInput');
    const dropdown = document.getElementById('pathDropdown');
    let selectedIndex = -1;
    let suggestions = [];

    if (!pathInput || !dropdown) return;

    // 键盘导航处理
    pathInput.addEventListener('keydown', (event) => {
        if (!dropdown.children.length) return;

        switch(event.key) {
            case 'ArrowUp':
                event.preventDefault();
                selectedIndex = Math.max(0, selectedIndex - 1);
                updateSelection();
                break;
            case 'ArrowDown':
                event.preventDefault();
                selectedIndex = Math.min(dropdown.children.length - 1, selectedIndex + 1);
                updateSelection();
                break;
            case 'Enter':
                event.preventDefault();
                if (selectedIndex >= 0) {
                    pathInput.value = suggestions[selectedIndex];
                    dropdown.style.display = 'none';
                }
                break;
            case 'Escape':
                dropdown.style.display = 'none';
                break;
        }
    });


    // 更新选中状态
    function updateSelection() {
        Array.from(dropdown.children).forEach((item, index) => {
            item.classList.toggle('selected', index === selectedIndex);
            if (index === selectedIndex) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    pathInput.addEventListener('input', async () => {
        const input = pathInput.value;
        
        try {
            // 直接使用返回值
            suggestions = await window.electron.fetchPathSuggestions(input) || [];
            console.debug('Received suggestions:', suggestions); // 添加调试日志

            selectedIndex = -1;
            this.updateDropdown(dropdown, suggestions, selectedIndex);
        } catch (error) {
            console.error('Error fetching path suggestions:', error);
            dropdown.style.display = 'none';
        }
    });

    // 点击外部关闭下拉框
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.path-input-container')) {
            dropdown.style.display = 'none';
        }
    });
  }

  // 新增辅助方法来更新下拉列表
  updateDropdown(dropdown, suggestions, selectedIndex) {
    if (suggestions && suggestions.length > 0) {
        dropdown.innerHTML = suggestions.map(suggestion => `
            <div class="path-suggestion-item">
                <span class="path-suggestion-icon">📁</span>
                ${suggestion}
            </div>
        `).join('');
        
        dropdown.style.display = 'block';

        // 添加鼠标事件
        Array.from(dropdown.children).forEach((item, index) => {
            item.addEventListener('mouseenter', () => {
                selectedIndex = index;
                // 修复：使用外部的updateSelection函数
                updateSelection(dropdown, selectedIndex);
            });
            item.addEventListener('click', () => {
                const pathInput = document.getElementById('pathInput');
                pathInput.value = suggestions[index];
                dropdown.style.display = 'none';
            });
        });
    } else {
        dropdown.style.display = 'none';
    }
  }
}
