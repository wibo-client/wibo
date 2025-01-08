import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import PluginHandlerImpl from './indexHandler/pluginHandlerImpl.mjs';
import LLMCall from './llmCaller/LLMCall.mjs';
import { fileURLToPath } from 'url';
import MainWindow from './mainWindow.mjs';
import ConfigHandler from './config/configHandler.mjs';
import ContentAggregator from './contentHandler/contentAggregator.mjs'; // 引入 ContentAggregator
import LLMBasedRerankImpl from './rerank/llmbasedRerankImpl.mjs'; // 引入 LLMBasedRerankImpl
import LLMBasedQueryRewriter from './requery/llmBasedRewriteQueryImpl.mjs'; // 引入 LLMBasedQueryRewriter
import LocalServerManager from './server/LocalServerManager.mjs'; // 添加 LocalServerManager 的导入

const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);
if (__dirname.endsWith(path.join('src'))) {
  __dirname = path.resolve(__dirname, '..', 'dist');
}

let mainWindow;
let globalContext; // 声明全局变量

async function init(createWindow = true) {
  console.log('Initializing application...');

  const configHandler = new ConfigHandler(); // 不再传递 store 实例
  const pluginHandler = new PluginHandlerImpl();
  const contentAggregator = new ContentAggregator();
  const rerankImpl = new LLMBasedRerankImpl(); // 实例化 LLMBasedRerankImpl
  const rewriteQueryer = new LLMBasedQueryRewriter(); // 实例化 LLMBasedQueryRewriter
  const localServerManager = new LocalServerManager(); // 添加 LocalServerManager 实例
  const llmCaller = new LLMCall();

  globalContext = { // 初始化全局变量
    pluginHandler,
    llmCaller,
    configHandler,
    contentAggregator,
    rerankImpl,
    rewriteQueryer,
    localServerManager
  };

  await llmCaller.init(globalContext);
  await rewriteQueryer.init(globalContext);
  await rerankImpl.init(globalContext); // 调用 init 方法
  await contentAggregator.init(globalContext); // 调用 init 方法
  await pluginHandler.init(globalContext);



  if (createWindow) {
    mainWindow = new MainWindow(__dirname);
    mainWindow.create();
  }
}

let javaProcess = null; // 存储 Java 进程的引用

app.whenReady().then(async () => {
  console.log('App is ready.');

  await init(); // 初始化全局变量

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow.create();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('quit', () => {
    console.log('App is quitting.');
  });

  ipcMain.handle('select-directory', async () => {
    return await dialog.showOpenDialog({
      properties: ['openDirectory']
    }).then(result => result.canceled ? null : result.filePaths[0]);
  });

  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'], // Ensure 'openFile' is included to allow file selection
      filters: [{ name: 'JavaScript Files', extensions: ['js'] }]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('add-plugin-from-file', async (event, filePath) => {
    await globalContext.pluginHandler.addPluginTemplateFromFile(filePath);
  });

  ipcMain.handle('get-token', () => {
    return globalContext.configHandler.getToken();
  });

  ipcMain.handle('set-token', (event, token) => {
    globalContext.configHandler.setToken(token);
  });

  ipcMain.handle('remove-token', () => {
    globalContext.configHandler.removeToken();
  });

  ipcMain.handle('get-plugin-instance-map', async () => {
    try {
      return await globalContext.pluginHandler.getPluginInstanceMapInfo();
    } catch (error) {
      console.error('Error getting plugin instance map:', error);
      throw error;
    }
  });

  ipcMain.handle('delete-plugin', async (event, pathPrefix) => {
    try {
      await globalContext.pluginHandler.deletePlugin(pathPrefix);
    } catch (error) {
      console.error('删除插件错误:', error);
      throw error;
    }
  });

  ipcMain.handle('send-message', async (event, message, type, path, requestId) => {
    console.log(`Received message: ${message}, type: ${type}, path: ${path}`);

    try {
      const selectedPlugin = await globalContext.pluginHandler.select(path);

      let pageFetchLimit = await globalContext.configHandler.getPageFetchLimit();

      if (type === 'search') {
        const searchResult = await selectedPlugin.search(message, path);
        const markdownResult = buildSearchResultsString(searchResult);
        event.sender.send('llm-stream', markdownResult, requestId);
      } else if (type === 'searchWithRerank') {
        const requeryResult = await selectedPlugin.rewriteQuery(message);
        let searchResults = [];
        for (const query of requeryResult) {
          const result = await selectedPlugin.search(query, path);
          searchResults = searchResults.concat(result);
          if (searchResults.length >= pageFetchLimit) {
            break;
          }
        }
        const rerankResult = await selectedPlugin.rerank(searchResults, message);
        const markdownResult = buildSearchResultsString(rerankResult);
        event.sender.send('llm-stream', markdownResult, requestId);
      } else if (type === 'searchAndChat') {
        const requeryResult = await selectedPlugin.rewriteQuery(message);
        let searchResults = [];
        for (const query of requeryResult) {
          const result = await selectedPlugin.search(query, path);
          searchResults = searchResults.concat(result);
          if (searchResults.length >= pageFetchLimit) {
            break;
          }
        }
        const rerankResult = await selectedPlugin.rerank(searchResults, message);
        // 插入获取相关内容的逻辑
        const aggregatedContent = await selectedPlugin.fetchAggregatedContent(rerankResult);
        const contextBuilder = [];
        let currentLength = 0;
        let partIndex = 1;
        const MAX_BATCH_SIZE_5000 = 28720;

        for (const doc of aggregatedContent) {
          if (partIndex > 10) break;

          let partHeader = '';
          if (doc.date) {
            partHeader = `\n# 第${partIndex++}篇参考内容（来自文件路径：${doc.url} 的 第 ${doc.paragraphOrder} 段 ,发布时间是 ${doc.date} ）：\n\n`;
          } else {
            partHeader = `\n# 第${partIndex++}篇参考内容（来自文件路径：${doc.url} 的 第 ${doc.paragraphOrder} 段）：\n\n`;
          }

          const combinedContent = `${partHeader} \n ## title :${doc.title}\n\n${doc.description}\n\n ## 详细内容：\n${doc.content}`;

          if (currentLength + combinedContent.length > MAX_BATCH_SIZE_5000) {
            contextBuilder.push(combinedContent.substring(0, MAX_BATCH_SIZE_5000 - currentLength));
            console.info(`Reached max batch size limit at document ${doc.title}`);
            break;
          }

          contextBuilder.push(combinedContent);
          currentLength += combinedContent.length;
          console.debug(`Added content from document ${doc.title}, current length: ${currentLength}`);
        }

        const suggestionContext = contextBuilder.join('');
        const userInput = message;

        const prompt = `尽可能依托于如下参考信息：\n${suggestionContext}\n\n处理用户的请求：\n${userInput}`;

        const messages = [
          { role: 'user', content: prompt }
        ];

        const returnStrfinal = { value: '' };
        const collectedResults = [];

        await globalContext.llmCaller.callAsync(messages, true, (chunk) => {
          event.sender.send('llm-stream', chunk, requestId);
        });

        // 添加参考文档部分
        const combinedOutput = [];
        combinedOutput.push("\n\n## Reference Documents:\n");
        let index = 1;
        for (const doc of aggregatedContent) {
          combinedOutput.push(`doc ${index}: [${doc.title}](${doc.url})\n`);
          combinedOutput.push("\n");
          if ((index++) > 3) {
            break;
          }
        }
        returnStrfinal.value += combinedOutput.join('');
        console.info("Final combined output: ", returnStrfinal.value);
        event.sender.send('llm-stream', returnStrfinal.value, requestId);
      } else if (type === 'chat') {
        await globalContext.llmCaller.callAsync([{ role: 'user', content: message }], true, (chunk) => {
          event.sender.send('llm-stream', chunk, requestId);
        });
      }
    } catch (error) {
      console.error(`Error occurred in handler for 'send-message': ${error}`, error);
      event.sender.send('error', { message: error.message }, requestId);
    }
  });

  ipcMain.handle('fetch-path-suggestions', async (event, input) => {
    try {
      const suggestions = await globalContext.pluginHandler.fetchPathSuggestions(input);
      event.sender.send('path-suggestions', suggestions);
    } catch (error) {
      console.error('获取路径建议错误:', error);
      event.sender.send('error', { message: error.message });
    }
  });

  ipcMain.handle('reinitialize', async () => {
    await init(false);
  });

  // 添加目录选择器处理
  ipcMain.handle('show-directory-picker', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return {
        filePath: result.filePaths[0]
      };
    }
    return null;
  });

  // 重写 toggle-knowledge-base 处理,修改handler名称与preload一致
  ipcMain.handle('toggleKnowledgeBase', async (event, enable) => {
    try {

      if (enable) {
        const result = await globalContext.localServerManager.startServer();
        return result;
      } else {
        const result = await globalContext.localServerManager.stopServer();
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

  // 添加 IPC 事件处理器
  ipcMain.handle('get-server-desired-state', async () => {
    const desiredState = globalContext.localServerManager.desiredState;
    const savedProcess = globalContext.localServerManager.store.get('javaProcess');
    const isHealthy = savedProcess ? await globalContext.localServerManager.checkHealth(savedProcess.port) : false;

    return {
      desiredState,
      isHealthy,
      pid: savedProcess?.pid || null,
      port: savedProcess?.port || null
    };
  });

  // 添加新的 IPC 处理器
  ipcMain.handle('get-global-config', async () => {
    return await globalContext.configHandler.getGlobalConfig();
  });

  ipcMain.handle('set-global-config', async (event, value) => {
    await globalContext.configHandler.setGlobalConfig(value);
  });

  // 确保在应用退出时清理 Java 进程
  app.on('before-quit', async () => {
    try {
      // 先设置期望状态为关闭
      await globalContext.localServerManager.stopServer();
      // 直接调用内部停止方法，强制关闭进程
      await globalContext.localServerManager._stopServer();

      // 额外确保进程被清理
      const savedProcess = globalContext.localServerManager.store.get('javaProcess');
      if (savedProcess && savedProcess.pid) {
        try {
          if (process.platform === 'win32') {
            spawn('taskkill', ['/F', '/PID', savedProcess.pid]);
          } else {
            process.kill(savedProcess.pid, 'SIGKILL');
          }
        } catch (e) {
          // 忽略错误，进程可能已经不存在
        }
      }
    } catch (error) {
      console.error('停止 Java 进程失败:', error);
    }
  });

  function buildSearchResultsString(searchResults) {
    let sb = '';
    let fileNumber = 1;
    searchResults.forEach(result => {
      sb += `#### index ${fileNumber++} 标题 ： [${result.title}](${result.url})\n\n`;

      sb += `${result.description}\n`;
      if (result.date) {
        sb += `${result.date}\n`;
      }
    });
    return sb;
  }

  // 全局异常处理
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    if (reason instanceof Error) {
      console.error('Error message:', reason.message);
      console.error('Error stack:', reason.stack);
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
  });
});