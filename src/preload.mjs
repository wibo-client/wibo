import { contextBridge, ipcRenderer, shell } from 'electron';
const { v4: uuidv4 } = require('uuid');

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', { key, value }),
  listFiles: async (dir) => {
    return await ipcRenderer.invoke('list-files', dir);
  },
  sendMessage: (message, type, path, context) => {
    const requestId = uuidv4();
    ipcRenderer.invoke('send-message', message, type, path, requestId)
      .then(response => {
        if (context && typeof context.callback === 'function') {
          context.callback(response);
        }
      })
      .catch(error => {
        console.error(`Error occurred: ${error}`);
      });

    ipcRenderer.on('llm-stream', (event, chunk, id) => {
      if (id === requestId && context && typeof context.onChunk === 'function') {
        context.onChunk(chunk);
      }
    });
  },
  fetchPathSuggestions: (input) => ipcRenderer.invoke('fetch-path-suggestions', input),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  calculateMD5: (path) => ipcRenderer.invoke('calculate-md5', path),
  shell: {
    openExternal: (url) => shell.openExternal(url)
  },
  selectFile: () => ipcRenderer.invoke('select-file'),
  addPluginFromFile: (filePath) => ipcRenderer.invoke('add-plugin-from-file', filePath),
  getPluginInstanceMap: () => ipcRenderer.invoke('get-plugin-instance-map')
});

contextBridge.exposeInMainWorld('auth', {
  getToken: () => ipcRenderer.invoke('get-token'),
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  removeToken: () => ipcRenderer.invoke('remove-token')
});
