import { contextBridge, ipcRenderer, shell } from 'electron';

// 暴露 electron API 到渲染进程
contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  sendMessage: (message, type, path, context) => {
    const requestId = context.requestId; // 使用传递的 UUID

    // 注册系统日志事件监听器
    ipcRenderer.on('system-log', (event, log, id) => {
      if (id === requestId && context?.onSystemLog) {
        context.onSystemLog(log);
      }
    });

    ipcRenderer.on('llm-stream', (event, chunk, id) => {
      if (id === requestId && context?.onChunk) {
        context.onChunk(chunk);
      }
    });

    // 添加参考文档事件监听器
    ipcRenderer.on('add-reference', (event, html, id) => {
      if (id === requestId && context?.onReference) {
        context.onReference(html);
      }
    });

    // 添加完成事件监听器
    ipcRenderer.on('llm-complete', (event, id) => {
      if (id === requestId && context?.onComplete) {
        context.onComplete();
      }
    });

    return ipcRenderer.invoke('send-message', message, type, path, requestId);
  },

  // 知识库相关方法 - 确保命名一致
  toggleKnowledgeBase: (enable) => ipcRenderer.invoke('toggleKnowledgeBase', enable),
  showDirectoryPicker: () => ipcRenderer.invoke('show-directory-picker'),

  // 路径建议相关方法
  fetchPathSuggestions: (input) => ipcRenderer.invoke('fetch-path-suggestions', input),

  onPathSuggestions: (callback) => {
    ipcRenderer.on('path-suggestions', (event, suggestions) => {
      callback(suggestions);
    });
  },

  // 获取服务器状态
  getServerDesiredState: () => ipcRenderer.invoke('get-server-desired-state'),

  // Shell 相关方法
  shell: {
    openExternal: (url) => shell.openExternal(url),
    // 添加打开文件目录的方法
    showItemInFolder: (path) => ipcRenderer.invoke('show-item-in-folder', path)
  },

  // 插件相关方法
  addPluginFromFile: (filePath) => ipcRenderer.invoke('add-plugin-from-file', filePath),
  getPluginInstanceMap: () => ipcRenderer.invoke('get-plugin-instance-map'),
  deletePlugin: (pathPrefix) => ipcRenderer.invoke('delete-plugin', pathPrefix),
  reinitialize: () => ipcRenderer.invoke('reinitialize'),

  // 全局配置相关方法
  getGlobalConfig: () => ipcRenderer.invoke('get-global-config'),
  setGlobalConfig: (value) => ipcRenderer.invoke('set-global-config', value),

  // 添加聊天记录相关方法
  chatHistory: {
    saveMessage: (message) => ipcRenderer.invoke('save-chat-message', message),
    getMessages: (offset, limit) => ipcRenderer.invoke('get-chat-messages', offset, limit),
    getMessageCount: () => ipcRenderer.invoke('get-chat-message-count'),
    deleteMessage: (messageId) => ipcRenderer.invoke('delete-chat-message', messageId),
    clearAllMessages: () => ipcRenderer.invoke('clear-all-chat-messages')
  },

  // 添加日志相关方法
  logs: {
    getLogs: (offset, limit) => ipcRenderer.invoke('get-application-logs', offset, limit),
    getLatestLogs: (lastKnownTotal) => ipcRenderer.invoke('get-latest-logs', lastKnownTotal),
    getLogPath: () => ipcRenderer.invoke('get-log-path')
  },

  // 添加 setDefaultHandler 方法
  setDefaultHandler: (pathPrefix) => ipcRenderer.invoke('set-default-handler', pathPrefix),

  // 添加终止任务方法
  stopCurrentTask: (requestId) => ipcRenderer.invoke('stop-current-task', requestId),

  // 更新上下文菜单命令监听器
  onContextMenuCommand: (callback) => {
    ipcRenderer.on('context-menu-command', (event, command, elementInfo) => {
      callback(command, elementInfo);
    });
  },

  // 添加对话框相关方法
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  showErrorBox: (title, message) => ipcRenderer.invoke('show-error-box', title, message),

  // 添加剪贴板方法
  clipboard: {
    writeText: (text) => ipcRenderer.invoke('clipboard-write-text', text),
  }
});

// 认证相关 API
contextBridge.exposeInMainWorld('auth', {
  login: (username, password, captchaCode, sessionId) =>
    ipcRenderer.invoke('auth-login', username, password, captchaCode, sessionId),
  register: (username, password) =>
    ipcRenderer.invoke('auth-register', username, password),
  getCurrentUser: () => ipcRenderer.invoke('auth-get-current-user'),
  generateCaptcha: (sessionId) => ipcRenderer.invoke('auth-generate-captcha', sessionId),
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  removeToken: () => ipcRenderer.invoke('remove-token')
});
