import { contextBridge, ipcRenderer, shell } from 'electron';
import { v4 as uuidv4 } from 'uuid';

// 暴露 electron API 到渲染进程
contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', { key, value }),
  listFiles: (dir) => ipcRenderer.invoke('list-files', dir),
  
  sendMessage: (message, type, path, context) => {
    const requestId = uuidv4();
    ipcRenderer.invoke('send-message', message, type, path, requestId)
      .then(response => {
        if (context?.callback) {
          context.callback(response);
        }
      })
      .catch(error => {
        console.error(`Error occurred: ${error}`);
      });

    ipcRenderer.on('llm-stream', (event, chunk, id) => {
      if (id === requestId && context?.onChunk) {
        context.onChunk(chunk);
      }
    });
  },

  // 知识库相关方法 - 确保命名一致
  toggleKnowledgeBase: (enable) => ipcRenderer.invoke('toggleKnowledgeBase', enable),

  // 文件系统相关方法
  fetchPathSuggestions: (input) => ipcRenderer.invoke('fetch-path-suggestions', input),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  calculateMD5: (path) => ipcRenderer.invoke('calculate-md5', path),
  selectFile: () => ipcRenderer.invoke('select-file'),
  showDirectoryPicker: () => ipcRenderer.invoke('show-directory-picker'),

  // 获取服务器期望状态
  getServerDesiredState: () => ipcRenderer.invoke('get-server-desired-state'),

  // Shell 相关方法
  shell: {
    openExternal: (url) => shell.openExternal(url)
  },

  // 插件相关方法
  addPluginFromFile: (filePath) => ipcRenderer.invoke('add-plugin-from-file', filePath),
  getPluginInstanceMap: () => ipcRenderer.invoke('get-plugin-instance-map'),
  deletePlugin: (pathPrefix) => ipcRenderer.invoke('delete-plugin', pathPrefix),
  reinitialize: () => ipcRenderer.invoke('reinitialize')
});

// 认证相关 API
contextBridge.exposeInMainWorld('auth', {
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  removeToken: () => ipcRenderer.invoke('remove-token')
});

// 路径建议处理
ipcRenderer.on('path-suggestions', (event, suggestions) => {
  const pathDropdown = document.getElementById('pathDropdown');
  if (!pathDropdown) return;

  pathDropdown.innerHTML = '';

  if (suggestions.length > 0) {
    suggestions.forEach(suggestion => {
      const div = document.createElement('div');
      div.textContent = suggestion;
      pathDropdown.appendChild(div);
    });
    pathDropdown.style.display = 'block';
  } else {
    pathDropdown.style.display = 'none';
  }
});

// 错误处理
ipcRenderer.on('error', (event, error) => {
  console.error('IPC Error:', error);
  alert(error.message || '操作失败');
});
