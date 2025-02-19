import { app, BrowserWindow, ipcMain, dialog, clipboard, shell } from 'electron'; // 添加 clipboard 和 shell 导入
import PluginHandlerImpl from './indexHandler/pluginHandlerImpl.mjs';
import UnifiedLLMCall from './llmCaller/UnifiedLLMCall.mjs'; // 引入 UnifiedLLMCall
import MainWindow from './mainWindow.mjs';
import ConfigHandler from './config/configHandler.mjs';
import ContentAggregator from './contentHandler/contentAggregator.mjs'; // 引入 ContentAggregator
import LLMBasedRerankImpl from './rerank/llmbasedRerankImpl.mjs'; // 引入 LLMBasedRerankImpl
import LLMBasedQueryRewriter from './requery/llmBasedRewriteQueryImpl.mjs'; // 引入 LLMBasedQueryRewriter
import LocalServerManager from './server/LocalServerManager.mjs'; // 添加 LocalServerManager 的导入
import ContentCrawler from './contentHandler/contentCrawler.mjs'; // 添加 ContentCrawler 的导入
import ChatStore from './config/chatStore.mjs'; // 添加 ChatStore 的导入
import ReferenceHandler from './references/referenceHandler.mjs';
import LogHandler from './logHandler/logHandler.mjs';  // 添加这行
import path from 'path'; // 添加 path 导入
import fs from 'fs';  // 添加 fs 模块导入
import AuthService from './server/services/AuthService.mjs'; // 添加 AuthService 的导入

// 添加常量定义
const MAX_BATCH_SIZE_5000 = 28720;

// 在文件顶部添加任务跟踪器
const activeRequests = new Map();

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
  const llmCaller = new UnifiedLLMCall();
  const contentCrawler = new ContentCrawler();
  const chatStore = new ChatStore(); // 实例化 ChatStore
  const referenceHandler = new ReferenceHandler();
  const logHandler = new LogHandler();

  // 初始化 AuthService
  const authService = new AuthService();

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
    referenceHandler,
    logHandler,
    authService
  };

  await llmCaller.init(globalContext);
  await rewriteQueryer.init(globalContext);
  await rerankImpl.init(globalContext); // 调用 init 方法
  await contentAggregator.init(globalContext); // 调用 init 方法
  await pluginHandler.init(globalContext);
  await contentCrawler.init(globalContext);
  await referenceHandler.init(globalContext);
  await localServerManager.init(globalContext);
  await logHandler.init(globalContext); // 添加这行
  await authService.init(globalContext); // 初始化 AuthService
  mainWindow = new MainWindow();
  mainWindow.init();
  mainWindow.create();
}

app.whenReady().then(async () => {
  console.log('App is ready.');

  await init(); // 初始化全局变量
  // 添加认证相关的 IPC 处理器
  ipcMain.handle('auth-login', async (event, username, password, captchaCode) => {
    try {
      const result = await globalContext.authService.login(username, password, captchaCode);
      // 移除对 configHandler 的依赖，因为 token 现在由 AuthService 管理
      return result;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  });

  ipcMain.handle('auth-register', async (event, username, password) => {
    try {
      return await globalContext.authService.register(username, password);
    } catch (error) {
      console.error('Register failed:', error);
      throw error;
    }
  });

  ipcMain.handle('auth-logout', async () => {
    try {
      return await globalContext.authService.logout();
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  });

  ipcMain.handle('auth-get-current-user', async (event) => {
    try {
      return await globalContext.authService.getCurrentUser();
    } catch (error) {
      console.error('Get current user failed:', error);
      throw error;
    }
  });

  ipcMain.handle('auth-generate-captcha', async (event, sessionId) => {
    try {
      return await globalContext.authService.generateCaptcha(sessionId);
    } catch (error) {
      console.error('Generate captcha failed:', error);
      throw error;
    }
  });

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

  async function callLLMAsync(messages, sendSystemLog, sendLLMStream) {
    try {
      await globalContext.llmCaller.callAsync(messages,
        true,
        (chunk) => {
          // 检查是否是错误消息
          if (chunk.startsWith('❌')) {
            sendSystemLog(chunk); // 将错误显示在系统日志中
          } else {
            sendLLMStream(chunk);
          }
        }
      );
    } catch (error) {
      // 确保错误信息被显示在系统日志中
      sendSystemLog(`❌ ${error.message}`);
      throw error;
    }
  }

  ipcMain.handle('send-message', async (event, message, type, path, requestId) => {
    console.log(`Received message: ${message}, type: ${type}, path: ${path}`);

    // 创建 AbortController 并存储
    const abortController = new AbortController();
    activeRequests.set(requestId, abortController);

    // 创建请求上下文
    const requestContext = {
      requestId,
      type,
      abortSignal: abortController.signal,
      sendSystemLog: (log) => event.sender.send('system-log', log, requestId),
      sendLLMStream: (markdownResult) => {
        // 如果已终止,则不发送任何内容到前端
        if (!abortController.signal.aborted) {
          event.sender.send('llm-stream', markdownResult, requestId);
        }
      },
      sendReference: (referenceData) => event.sender.send('add-reference', referenceData, requestId),
      results: {},
      // 添加检查终止的函数
      checkAborted: function () {
        if (this.abortSignal.aborted) {
          this.sendSystemLog('⚠️ 任务正在被终止...');
          throw new Error('任务已被终止');
        }
      }
    };

    try {
      requestContext.checkAborted();
      const selectedPlugin = await globalContext.pluginHandler.select(path);
      requestContext.selectedPlugin = selectedPlugin;

      if (type === 'search') {
        requestContext.sendSystemLog('🔍 进入直接搜索...');
        await selectedPlugin.quickSearch_searchAndRerank(message, path, requestContext);
        await selectedPlugin.buildSearchResultsString(message, path, requestContext);
        requestContext.sendLLMStream(requestContext.results.markdownResult);
        requestContext.sendSystemLog('✅ 搜索完成');

      } else if (type === 'deepSearch') {
        requestContext.sendSystemLog('🔍 进入深问模式，大模型会遍历所有的文档片段，回答将更全面，但消耗的token相对较多，时间较慢');
        requestContext.checkAborted();
        await selectedPlugin.deepSearch_collectFacts(message, path, requestContext);
        requestContext.checkAborted();
        await selectedPlugin.deepSearch_refineParsedFacts(message, path, requestContext);
        requestContext.checkAborted();

        const finalPrompt = `请基于以下参考内容回答问题：
        参考内容：
        ${requestContext.results.refinedFacts.fact}
        
        问题：${message}`;

        await callLLMAsync(
          [{ role: 'user', content: finalPrompt }],
          requestContext.sendSystemLog,
          requestContext.sendLLMStream
        );

        await selectedPlugin.buildReferenceData(message, path, requestContext);
        requestContext.sendReference(requestContext.results.referenceData);
        requestContext.sendSystemLog('✅ 数据准备完成，开始依托数据回答问题');

      } else if (type === 'quickSearch') {
        requestContext.sendSystemLog('🔍 快速检问模式，大模型会根据关键词查索引找相关文档并取靠前的内容，速度较快，但可能因为索引没命中而漏掉信息');

        await selectedPlugin.quickSearch_searchAndRerank(message, path, requestContext);
        requestContext.checkAborted();

        await selectedPlugin.quickSearch_fetchDetailsWithLimit(message, path, requestContext);
        requestContext.checkAborted();

        await selectedPlugin.quickSearch_buildPromptFromContent(message, path, requestContext);

        await callLLMAsync(
          [{ role: 'user', content: requestContext.results.finalPrompt }],
          requestContext.sendSystemLog,
          requestContext.sendLLMStream
        );

        await selectedPlugin.buildReferenceData(message, path, requestContext);
        requestContext.sendReference(requestContext.results.referenceData);
        requestContext.sendSystemLog('✅ 数据准备完成，开始依托数据回答问题');

      } else if (type === 'chat') {
        requestContext.sendSystemLog('💬 启动直接对话模式...');
        await callLLMAsync(
          [{ role: 'user', content: message }],
          requestContext.sendSystemLog,
          requestContext.sendLLMStream);
        requestContext.sendSystemLog('✅ 开始回答');
      }

    } catch (error) {
      console.error(`Error occurred in handler for 'send-message': ${error}`, error);
      let errorMessage = error.message;
      if (abortController.signal.aborted) {
        errorMessage = '❌ 任务已被终止';
      }
      requestContext.sendSystemLog(errorMessage);
      event.sender.send('error', { message: errorMessage }, requestId);
    } finally {
      // 清理请求
      activeRequests.delete(requestId);
    }
  });

  // 删除重复的处理器，只保留这一个，并优化实现
  ipcMain.handle('stop-current-task', async (event, requestId) => {
    try {
      console.log('尝试终止任务:', requestId);
      const abortController = activeRequests.get(requestId);
      if (!abortController) {
        console.log('未找到对应的任务:', requestId);
        console.log('当前活跃任务列表:', Array.from(activeRequests.keys()));
        throw new Error('任务未找到，可能是终止已经提交了');
      }

      abortController.abort();
      activeRequests.delete(requestId);
      console.log('成功终止任务:', requestId);
      return { success: true };
    } catch (error) {
      console.error('终止任务失败:', error);
      throw error;
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

  // 修改IPC处理器
  ipcMain.handle('save-chat-message', async (event, message) => {
    return globalContext.chatStore.addMessage(message);
  });

  ipcMain.handle('get-chat-messages', async (event, offset, limit) => {
    return globalContext.chatStore.getMessages(offset, limit);
  });

  ipcMain.handle('delete-chat-message', async (event, messageId) => {
    return globalContext.chatStore.deleteMessage(messageId);
  });

  ipcMain.handle('clear-all-chat-messages', async () => {
    return globalContext.chatStore.clearAllMessages();
  });

  ipcMain.handle('set-default-handler', async (event, pathPrefix) => {
    try {
      await globalContext.pluginHandler.setDefaultHandler(pathPrefix);
    } catch (error) {
      console.error('设置默认插件失败:', error);
      throw error;
    }
  });

  // 添加新的 IPC 处理器
  ipcMain.handle('get-application-logs', async (event, offset, limit) => {
    try {
      return await globalContext.logHandler.getLogs(offset, limit);
    } catch (error) {
      console.error('获取日志失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-latest-logs', async (event, lastKnownTotal) => {
    try {
      return await globalContext.logHandler.getLatestLogs(lastKnownTotal);
    } catch (error) {
      console.error('获取最新日志失败:', error);
      throw error;
    }
  });

  ipcMain.handle('get-log-path', async () => {
    try {
      const { getLogPath } = await import('./utils/loggerUtils.mjs');
      return getLogPath();
    } catch (error) {
      console.error('获取日志路径失败:', error);
      throw error;
    }
  });

  // 添加对话框相关的 IPC 处理器
  ipcMain.handle('show-message-box', async (event, options) => {
    // 确保在主窗口中显示对话框
    const mainWindow = BrowserWindow.getFocusedWindow();
    return await dialog.showMessageBox(mainWindow, {
      ...options,
      defaultId: 0,
      cancelId: 1,
      // 设置默认按钮，如果没有提供
      buttons: options.buttons || ['确定'],
      // 设置默认类型，如果没有提供
      type: options.type || 'info'
    });
  });

  ipcMain.handle('show-error-box', async (event, title, message) => {
    return dialog.showErrorBox(title, message);
  });

  // 添加剪贴板写入处理器
  ipcMain.handle('clipboard-write-text', async (event, text) => {
    try {
      clipboard.writeText(text);
      return { success: true };
    } catch (error) {
      console.error('写入剪贴板失败:', error);
      throw error;
    }
  });

  // 修改打开文件目录的处理器,增加文件存在性检查
  ipcMain.handle('show-item-in-folder', async (event, filePath) => {
    try {
      // 处理路径分隔符
      const normalizedPath = decodeURIComponent(filePath).replace(/\\/g, path.sep).replace(/\//g, path.sep);

      // 获取文件所在目录
      const dirPath = path.dirname(normalizedPath);

      // 检查目录是否存在
      if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      // 先检查文件是否存在
      const fileExists = fs.existsSync(normalizedPath);
      if (fileExists) {
        // 如果文件存在,显示并选中文件
        shell.showItemInFolder(normalizedPath);
      } else {
        // 如果文件不存在,只打开目录
        shell.openPath(dirPath);
      }

      return { success: true };
    } catch (error) {
      console.error('打开文件目录失败:', error);
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