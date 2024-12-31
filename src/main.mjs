import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import PluginHandlerImpl from './component/indexHandler/pluginHandlerImpl.mjs';
import LLMCall from './component/llmCaller/LLMCall.mjs';
import { fileURLToPath } from 'url';
import MainWindow from './component/mainWindow.mjs';
import FileHandler from './component/file/fileHandler.mjs';
import ConfigHandler from './component/config/configHandler.mjs';
import ConfigKeys from './config/configKeys.mjs'; // 引入共享的配置枚举值
import ContentAggregator from './component/contentHandler/contentAggregator.mjs'; // 引入 ContentAggregator
import LLMBasedRerankImpl from './component/rerank/llmbasedRerankImpl.mjs'; // 引入 LLMBasedRerankImpl

const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);
if (__dirname.endsWith(path.join('src'))) {
  __dirname = path.resolve(__dirname, '..', 'dist');
}

let mainWindow;
const configHandler = new ConfigHandler(); // 不再传递 store 实例
const pluginHandler = new PluginHandlerImpl();
const fileHandler = new FileHandler(__dirname);
const contentAggregator = new ContentAggregator();
const rerankImpl = new LLMBasedRerankImpl(); // 实例化 LLMBasedRerankImpl
const llmCaller = new LLMCall();

async function init(createWindow = true) {
  console.log('Initializing application...');
 
  const globalConfig = await configHandler.getGlobalConfig(); // 获取全局配置

  const globalContext = {
    pluginHandler,
    llmCaller,
    globalConfig,
    fileHandler,
    configHandler,
    contentAggregator,
    rerankImpl // 添加到 globalContext
  };
  
  await llmCaller.init(globalConfig[ConfigKeys.MODEL_SK]);
  await rerankImpl.init(globalContext); // 调用 init 方法
  await contentAggregator.init(globalContext); // 调用 init 方法
  await pluginHandler.init(globalContext); // 传递 globalConfig
 
  if(createWindow) {
    mainWindow = new MainWindow(__dirname);
    mainWindow.create();
  }
  return globalContext;
}

app.whenReady().then(async () => {
  console.log('App is ready.');

  const globalContext = await init();

  const { pluginHandler, fileHandler, configHandler } = globalContext;

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

  ipcMain.handle('calculate-md5', async (event, filePath) => {
    return await fileHandler.calculateMD5InWorker(filePath);
  });

  ipcMain.handle('list-files', async (event, dirPath) => {
    return await fileHandler.listFiles(dirPath);
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    return await fileHandler.readFile(filePath);
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
    await pluginHandler.addPluginTemplateFromFile(filePath);
  });

  ipcMain.handle('get-config', async (event, key) => {
    const config = await configHandler.getConfig(key);
    return JSON.stringify(config); // 返回 JSON 字符串
  });

  ipcMain.handle('set-config', (event, { key, value }) => {
    const configValue = JSON.parse(value); // 将 JSON 字符串解析为对象
    configHandler.setConfig(key, configValue);
  });

  ipcMain.handle('get-token', () => {
    return configHandler.getToken();
  });

  ipcMain.handle('set-token', (event, token) => {
    configHandler.setToken(token);
  });

  ipcMain.handle('remove-token', () => {
    configHandler.removeToken();
  });

  ipcMain.handle('get-plugin-instance-map', async () => {
    await pluginHandler.loadPlugins();
    const pluginInstanceMap = {};
    for (const [pathPrefix, pluginInstance] of pluginHandler.pluginInstanceMap) {
      pluginInstanceMap[pathPrefix] = {
        getHandlerName: pluginInstance.handlerConfig
      };
    }
    return pluginInstanceMap;
  });

  ipcMain.handle('delete-plugin', async (event, pathPrefix) => {
    try {
      await pluginHandler.deletePlugin(pathPrefix);
    } catch (error) {
      console.error('删除插件错误:', error);
      throw error;
    }
  });

  ipcMain.handle('send-message', async (event, message, type, path, requestId) => {
    console.log(`Received message: ${message}, type: ${type}, path: ${path}`);

    try {
      const selectedPlugin = await pluginHandler.select(path);

      if (type === 'search') {
        const searchResult = await selectedPlugin.search(message, path);
        const markdownResult = buildSearchResultsString(searchResult);
        event.sender.send('llm-stream', markdownResult, requestId);
      } else if (type === 'searchWithRerank') {
        const requeryResult = await selectedPlugin.rewriteQuery(message);
        const searchResult = await selectedPlugin.search(requeryResult, path);
        const rerankResult = await selectedPlugin.rerank(searchResult, message);
        const markdownResult = buildSearchResultsString(rerankResult);
        event.sender.send('llm-stream', markdownResult, requestId);
      } else if (type === 'searchAndChat') {
        const requeryResult = await selectedPlugin.rewriteQuery(message);
        const searchResult = await selectedPlugin.search(requeryResult, path);
        const rerankResult = await selectedPlugin.rerank(searchResult, message);
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

        await llmCaller.callAsync(messages, true, (chunk) => {
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
        await llmCaller.callAsync([{ role: 'user', content: message }], true, (chunk) => {
          event.sender.send('llm-stream', chunk, requestId);
        });
      }
    } catch (error) {
      console.error(`Error occurred in handler for 'send-message': ${error}`);
      event.sender.send('error', { message: error.message }, requestId);
    }
  });

  ipcMain.handle('fetch-path-suggestions', async (event, input) => {
    try {
      const suggestions = await pluginHandler.fetchPathSuggestions(input);
      event.sender.send('path-suggestions', suggestions);
    } catch (error) {
      console.error('获取路径建议错误:', error);
      event.sender.send('error', { message: error.message });
    }
  });

  ipcMain.handle('reinitialize', async () => {
    await init(false);
  });

  function buildSearchResultsString(searchResults) {
    let sb = '';
    let fileNumber = 1;
    searchResults.forEach(result => {
      sb += `## index ${fileNumber++} 标题 ： [${result.title}](${result.url})\n\n`;

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