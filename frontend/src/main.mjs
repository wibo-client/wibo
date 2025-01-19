import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import PluginHandlerImpl from './indexHandler/pluginHandlerImpl.mjs';
import LLMCall from './llmCaller/LLMCall.mjs';
import MainWindow from './mainWindow.mjs';
import ConfigHandler from './config/configHandler.mjs';
import ContentAggregator from './contentHandler/contentAggregator.mjs'; // 引入 ContentAggregator
import LLMBasedRerankImpl from './rerank/llmbasedRerankImpl.mjs'; // 引入 LLMBasedRerankImpl
import LLMBasedQueryRewriter from './requery/llmBasedRewriteQueryImpl.mjs'; // 引入 LLMBasedQueryRewriter
import LocalServerManager from './server/LocalServerManager.mjs'; // 添加 LocalServerManager 的导入
import ContentCrawler from './contentHandler/contentCrawler.mjs'; // 添加 ContentCrawler 的导入
import ChatStore from './config/chatStore.mjs'; // 添加 ChatStore 的导入
import ReferenceHandler from './references/referenceHandler.mjs';

// 添加常量定义
const MAX_BATCH_SIZE_5000 = 28720;

let mainWindow;
let globalContext; // 声明全局变量

async function init() {
  console.log('Initializing application...');

  const configHandler = new ConfigHandler(); // 不再传递 store 实例
  const pluginHandler = new PluginHandlerImpl();
  const contentAggregator = new ContentAggregator();
  const rerankImpl = new LLMBasedRerankImpl(); // 实例化 LLMBasedRerankImpl
  const rewriteQueryer = new LLMBasedQueryRewriter(); // 实例化 LLMBasedQueryRewriter
  const localServerManager = new LocalServerManager(); // 添加 LocalServerManager 实例
  const llmCaller = new LLMCall();
  const contentCrawler = new ContentCrawler();
  const chatStore = new ChatStore(); // 实例化 ChatStore
  const referenceHandler = new ReferenceHandler();

  globalContext = { // 初始化全局变量
    pluginHandler,
    llmCaller,
    configHandler,
    contentAggregator,
    rerankImpl,
    rewriteQueryer,
    contentCrawler,
    localServerManager,
    chatStore,
    referenceHandler
  };

  await llmCaller.init(globalContext);
  await rewriteQueryer.init(globalContext);
  await rerankImpl.init(globalContext); // 调用 init 方法
  await contentAggregator.init(globalContext); // 调用 init 方法
  await pluginHandler.init(globalContext);
  await contentCrawler.init(globalContext);
  await referenceHandler.init(globalContext);

  mainWindow = new MainWindow();
  mainWindow.init();
  mainWindow.create();
}

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

    // 发送系统日志的辅助函数
    const sendSystemLog = (log) => {
      event.sender.send('system-log', log, requestId);
    };

    try {
      sendSystemLog('🔍 正在选择合适的插件...');
      const selectedPlugin = await globalContext.pluginHandler.select(path);
      sendSystemLog(`✅ 已选择插件: ${path}`);



      if (type === 'search') {
        const searchResults = await globalContext.referenceHandler.handleSearchResults(message, path, selectedPlugin, sendSystemLog);
        const markdownResult = await globalContext.referenceHandler.buildSearchResultsString(searchResults);
        event.sender.send('llm-stream', markdownResult, requestId);
        sendSystemLog('✅ 搜索完成');

      } else if (type === 'highQuilityRAGChat') {

        const searchResults = await globalContext.referenceHandler.handleSearchResults(message, path, selectedPlugin, sendSystemLog);
        //map 过程，尽可能收集所有的关键信息
        let parsedFacts = await globalContext.referenceHandler.handleAggregatedContent(searchResults, message, selectedPlugin, sendSystemLog);

        // reduce 过程 精炼 parsedFacts
        parsedFacts = await globalContext.referenceHandler.refineParsedFacts(parsedFacts, message, sendSystemLog);

        // 合并所有事实内容
        const allFacts = parsedFacts.fact;
        const finalPrompt = `请基于以下参考内容回答问题：
        参考内容：
        ${allFacts}
        
        问题：${message}`;

        // 直接发送最终总结
        await globalContext.llmCaller.callAsync(
          [{ role: 'user', content: finalPrompt }],
          true,
          (chunk) => event.sender.send('llm-stream', chunk, requestId)
        );

        // 获取所有已被引用的 URLs
        const citedUrls = new Set(parsedFacts.urls);

        // 重新排序 searchResults，被引用的排在前面
        const sortedSearchResults = [...searchResults].sort((a, b) => {
          const aIsCited = citedUrls.has(a.realUrl);
          const bIsCited = citedUrls.has(b.realUrl);
          return bIsCited - aIsCited; // 被引用的排在前面
        });

        // 发送引用数据到渲染进程
        const referenceData = {
          fullContent: sortedSearchResults.map((doc, index) => ({
            index: index + 1,
            title: doc.title,
            url: doc.realUrl,
            date: doc.date,
            description: doc.description.replace(/<\/?[^>]+(>|$)/g, "").replace(/<em>/g, "").replace(/<\/em>/g, ""),
          })),
          displayedContent: sortedSearchResults.slice(0, 3).map((doc, index) => ({
            index: index + 1,
            title: doc.title,
            url: doc.realUrl,
            date: doc.date,
            description: doc.description.replace(/<\/?[^>]+(>|$)/g, "").replace(/<em>/g, "").replace(/<\/em>/g, ""),
          })),
          totalCount: searchResults.length
        };

        sendSystemLog('📚 添加参考文档...');
        event.sender.send('add-reference', referenceData, requestId);
        sendSystemLog('✅ 搜索完成');
      } else if (type === 'searchAndChat') {
        const prompt = await globalContext.referenceHandler.handleLightSearchResults(message, path, selectedPlugin, sendSystemLog);
        
        const messages = [{ role: 'user', content: prompt }];

        await globalContext.llmCaller.callAsync(messages, true, (chunk) => {
          event.sender.send('llm-stream', chunk, requestId);
        });

        // 移除 DOM 操作相关代码，改为构建数据对象
        const referenceData = {
          fullContent: aggregatedContent.map((doc, index) => ({
            index: index + 1,
            title: doc.title,
            url: doc.realUrl,
            date: doc.date,
            description: doc.description
              .replace(/<\/?h[1-6][^>]*>/gi, "") // 去掉所有的 <h1> 到 <h6> 标签
              .replace(/\n/g, " ") // 去掉所有的换行符
              .replace(/<br\s*\/?>/gi, " ") // 去掉所有的 <br> 标签
              .replace(/^#{1,6}\s+/gm, "") // 去掉所有的 # ## ### ....#####
          })),
          displayedContent: aggregatedContent.slice(0, 3).map((doc, index) => ({
            index: index + 1,
            title: doc.title,
            url: doc.realUrl,
            date: doc.date,
            description: doc.description
              .replace(/<\/?h[1-6][^>]*>/gi, "") // 去掉所有的 <h1> 到 <h6> 标签
              .replace(/\n/g, " ") // 去掉所有的换行符
              .replace(/<br\s*\/?>/gi, " ") // 去掉所有的 <br> 标签
              .replace(/^#{1,6}\s+/gm, "") // 去掉所有的 # ## ### ....#####
          })),
          totalCount: aggregatedContent.length
        };

        // 发送引用数据到渲染进程
        sendSystemLog('📚 添加参考文档...');
        event.sender.send('add-reference', referenceData, requestId);

      } else if (type === 'chat') {
        sendSystemLog('💬 启动直接对话模式...');
        await globalContext.llmCaller.callAsync(
          [{ role: 'user', content: message }],
          true,
          (chunk) => event.sender.send('llm-stream', chunk, requestId)
        );
        sendSystemLog('✅ 对话完成');
      }

    } catch (error) {
      console.error(`Error occurred in handler for 'send-message': ${error}`, error);
      sendSystemLog(`❌ 错误: ${error.message}`);
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

    const ret = await globalContext.localServerManager.getCurrentServerInfo();

    return ret;
  });

  // 添加新的 IPC 处理器
  ipcMain.handle('get-global-config', async () => {
    return await globalContext.configHandler.getGlobalConfig();
  });

  ipcMain.handle('set-global-config', async (event, value) => {
    await globalContext.configHandler.setGlobalConfig(value);
  });

  // 添加IPC处理器
  ipcMain.handle('save-chat-message', async (event, message) => {
    globalContext.chatStore.addMessage(message);
  });

  ipcMain.handle('get-chat-messages', async (event, offset, limit) => {
    return globalContext.chatStore.getMessages(offset, limit);
  });

  ipcMain.handle('set-default-handler', async (event, pathPrefix) => {
    try {
      await globalContext.pluginHandler.setDefaultHandler(pathPrefix);
    } catch (error) {
      console.error('设置默认插件失败:', error);
      throw error;
    }
  });

  // 确保在应用退出时清理 Java 进程
  app.on('before-quit', async () => {
    try {
      console.log('Stopping Java process...');
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

          console.log('Java process stopped. PID:', savedProcess.pid);

        } catch (e) {
          // 忽略错误，进程可能已经不存在
          console.error('Error stopping Java process:', e);
        }
      }
    } catch (error) {
      console.error('停止 Java 进程失败:', error);
    }
  });

  app.on('quit', () => {
    console.log('App is quitting.');
  });

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