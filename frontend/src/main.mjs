import { app, BrowserWindow } from 'electron';
import { fileURLToPath } from 'url';
import path from 'path';
import { setupIpcHandlers } from './handlers/ipcHandlers.mjs';
import { initializeGlobalContext } from './initializer.mjs';
import MainWindow from './mainWindow.mjs';

const __filename = fileURLToPath(import.meta.url);
let __dirname = path.dirname(__filename);
if (__dirname.endsWith(path.join('src'))) {
  __dirname = path.resolve(__dirname, '..', 'dist');
}

let mainWindow;
let globalContext;

async function init(createWindow = true) {
  console.log('Initializing application...');
  globalContext = await initializeGlobalContext();
  
  if(createWindow) {
    mainWindow = new MainWindow(__dirname);
    mainWindow.create();
  }
  return globalContext;
}

app.whenReady().then(async () => {
  console.log('App is ready.');
  
  globalContext = await init();
  setupIpcHandlers(globalContext);

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

  // 确保在应用退出时清理 Java 进程
  app.on('before-quit', async () => {
    try {
      await globalContext.localServerManager.stopServer();
      await globalContext.localServerManager._stopServer();
      
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