import { contextBridge, ipcRenderer, shell } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', { key, value }),
  listFiles: async (dir) => {
    return await ipcRenderer.invoke('list-files', dir);
  },
  sendMessage: (message, type, path) => ipcRenderer.invoke('send-message', message, type, path),
  fetchPathSuggestions: (input) => ipcRenderer.invoke('fetch-path-suggestions', input),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  calculateMD5: (path) => ipcRenderer.invoke('calculate-md5', path),
  onStreamChunk: (callback) => ipcRenderer.on('llm-stream', (event, chunk) => callback(chunk)),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel), // 新增方法
  shell: {
    openExternal: (url) => shell.openExternal(url)
  }
});

contextBridge.exposeInMainWorld('auth', {
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  removeToken: () => ipcRenderer.invoke('remove-token')
});
