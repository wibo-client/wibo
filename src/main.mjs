import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import crypto from 'crypto';
import chokidar from 'chokidar';
import { Worker } from 'worker_threads';
import { Configuration, OpenAIApi } from 'openai';
import PluginHandlerImpl from './component/indexHandler/pluginHandlerImpl.mjs';
import LLMCall from './component/llmCaller/LLMCall.mjs';
import { fileURLToPath } from 'url';
import MainWindow from './component/mainWindow.mjs';
import FileHandler from './component/file/fileHandler.mjs';
import ConfigHandler from './component/config/configHandler.mjs';

const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);
if (__dirname.endsWith(path.join('src'))) {
  __dirname = path.resolve(__dirname, '..', 'dist');
}

const store = new Store();
let mainWindow;

app.whenReady().then(() => {
  console.log('App is ready.');
  mainWindow = new MainWindow(__dirname);
  mainWindow.create();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow.create();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', () => {
  console.log('App is quitting.');
});

const fileHandler = new FileHandler(__dirname);
const configHandler = new ConfigHandler(store);

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

ipcMain.handle('get-config', (event, key) => {
  return configHandler.getConfig(key);
});

ipcMain.handle('set-config', (event, { key, value }) => {
  configHandler.setConfig(key, value);
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

ipcMain.handle('removeAllListeners', (event, channel) => {
  ipcMain.removeAllListeners(channel);
});

ipcMain.handle('send-message', async (event, message, type, path) => {
  try {
    const pluginHandler = new PluginHandlerImpl();
    const selectedPlugin = await pluginHandler.select(path);
    const llmCaller = new LLMCall(process.env.DASHSCOPE_API_KEY);

    if (type === 'search') {
      const searchResult = await selectedPlugin.search(message, path);
      const markdownResult = buildSearchResultsString(searchResult);
      event.sender.send('llm-stream', markdownResult);
    } else if (type === 'searchWithRerank') {
      const requeryResult = await selectedPlugin.rewriteQuery(message);
      const searchResult = await selectedPlugin.search(requeryResult, path);
      const rerankResult = await selectedPlugin.rerank(searchResult, message);
      const markdownResult = buildSearchResultsString(rerankResult);
      event.sender.send('llm-stream', markdownResult);
    } else if (type === 'searchAndChat') {
      const requeryResult = await selectedPlugin.rewriteQuery(message);
      const searchResult = await selectedPlugin.search(requeryResult, path);
      const rerankResult = await selectedPlugin.rerank(searchResult, message);
      await llmCaller.callAsync([{ role: 'user', content: rerankResult }], true, (chunk) => {
        event.sender.send('llm-stream', chunk);
      });
    } else if (type === 'chat') {
      await llmCaller.callAsync([{ role: 'user', content: message }], true, (chunk) => {
        event.sender.send('llm-stream', chunk);
      });
    }
  } catch (error) {
    console.error(`Error occurred in handler for 'send-message': ${error}`);
    event.sender.send('error', { message: error.message });
  }
});

ipcMain.handle('fetch-path-suggestions', async (event, input) => {
 
});

function buildSearchResultsString(searchResults) {
  let sb = '';
  let fileNumber = 1;
  searchResults.forEach(result => {
    sb += `## index ${fileNumber++} 标题 ： [${result.title}](${result.url})\n\n`;

    sb += `${result.description}\n`;
    if(result.date) {
      sb += `${result.date}\n`;
    }
  });
  return sb;
}