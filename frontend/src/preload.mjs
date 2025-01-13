import { contextBridge, ipcRenderer, shell } from 'electron';
import { v4 as uuidv4 } from 'uuid';

// 暴露 electron API 到渲染进程
contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  sendMessage: (message, type, path, context) => {
    const requestId = uuidv4();
    
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
    openExternal: (url) => shell.openExternal(url)
  },

  // 插件相关方法
  addPluginFromFile: (filePath) => ipcRenderer.invoke('add-plugin-from-file', filePath),
  getPluginInstanceMap: () => ipcRenderer.invoke('get-plugin-instance-map'),
  deletePlugin: (pathPrefix) => ipcRenderer.invoke('delete-plugin', pathPrefix),
  reinitialize: () => ipcRenderer.invoke('reinitialize'),

  // 全局配置相关方法
  getGlobalConfig: () => ipcRenderer.invoke('get-global-config'),
  setGlobalConfig: (value) => ipcRenderer.invoke('set-global-config', value)
});

// 认证相关 API
contextBridge.exposeInMainWorld('auth', {
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  removeToken: () => ipcRenderer.invoke('remove-token')
});
