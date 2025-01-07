import { ipcMain, dialog } from 'electron';
import { handleSearchAndChat } from './messageHandler.mjs';

export function setupIpcHandlers(globalContext) {
  const { pluginHandler, fileHandler, configHandler, localServerManager } = globalContext;

  // 文件操作相关
  ipcMain.handle('calculate-md5', async (event, filePath) => {
    return await fileHandler.calculateMD5InWorker(filePath);
  });

  ipcMain.handle('list-files', async (event, dirPath) => {
    return await fileHandler.listFiles(dirPath);
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    return await fileHandler.readFile(filePath);
  });

  // 对话框相关
  ipcMain.handle('select-directory', async () => {
    return await dialog.showOpenDialog({
      properties: ['openDirectory']
    }).then(result => result.canceled ? null : result.filePaths[0]);
  });

  // 配置相关
  ipcMain.handle('get-config', async (event, key) => {
    const config = await configHandler.getConfig(key);
    return JSON.stringify(config);
  });

  ipcMain.handle('set-config', (event, { key, value }) => {
    const configValue = JSON.parse(value);
    configHandler.setConfig(key, configValue);
  });

  // 消息处理相关
  ipcMain.handle('send-message', async (event, message, type, path, requestId) => {
    console.log(`Received message: ${message}, type: ${type}, path: ${path}`);
    try {
      const selectedPlugin = await pluginHandler.select(path);
      if (type === 'searchAndChat') {
        await handleSearchAndChat(event, message, path, requestId, selectedPlugin, globalContext);
      } else {
        // 处理其他类型的消息...
        // ...现有代码...
      }
    } catch (error) {
      console.error(`Error occurred in handler for 'send-message': ${error}`);
      event.sender.send('error', { message: error.message }, requestId);
    }
  });

  // 本地服务器相关处理器
  ipcMain.handle('get-server-desired-state', async () => {
    const desiredState = localServerManager.desiredState;
    const savedProcess = localServerManager.store.get('javaProcess');
    const isHealthy = savedProcess ? await localServerManager.checkHealth(savedProcess.port) : false;
    
    return {
      desiredState,
      isHealthy,
      pid: savedProcess?.pid || null,
      port: savedProcess?.port || null
    };
  });

  ipcMain.handle('toggleKnowledgeBase', async (event, enable) => {
    try {
      if (enable) {
        const result = await localServerManager.startServer();
        return result;
      } else {
        const result = await localServerManager.stopServer();
        return result;
      }
    } catch (error) {
      console.error('切换知识库服务失败:', error);
      return { 
        success: false, 
        message: error.message || '操作失败'
      };
    }
  });

  // 插件相关处理器
  ipcMain.handle('get-plugin-instance-map', async () => {
    try {
      return await pluginHandler.getPluginInstanceMapInfo();
    } catch (error) {
      console.error('Error getting plugin instance map:', error);
      throw error;
    }
  });

  // 路径建议相关
  ipcMain.handle('fetch-path-suggestions', async (event, input) => {
    try {
      const suggestions = await pluginHandler.fetchPathSuggestions(input);
      return suggestions;
    } catch (error) {
      console.error('获取路径建议错误:', error);
      throw error;
    }
  });

  // 其他现有的 IPC 处理器...
  // ...existing code...
}
