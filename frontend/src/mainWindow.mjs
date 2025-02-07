import { BrowserWindow, app, Menu, clipboard } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/loggerUtils.mjs';

class MainWindow {
  constructor() {
    this.baseDir = null;
    this.window = null;
    this.preloadPath = null;
    this.rightClickPosition = null; // 存储右键点击的位置
  }

  init() {
    if (app.isPackaged) {
      // this.preloadPath = path.join(process.resourcesPath, 'preload.js');
      this.baseDir = path.join(process.resourcesPath, 'app.asar', 'dist');
    } else {
      const __filenameLocal = fileURLToPath(import.meta.url);
      let __dirnameLocal = path.dirname(__filenameLocal);
      if (__dirnameLocal.endsWith(path.join('src'))) {
        __dirnameLocal = path.resolve(__dirnameLocal, '..', 'dist');
      }
      this.baseDir = __dirnameLocal;
      // this.preloadPath = path.join(this.baseDir, 'preload.js');
    }
    logger.info(`Base directory: ${this.baseDir}`);
    // logger.info(`Preload script: ${this.preloadPath}`);
  }

  create() {
    logger.info('Creating main window...');
    const preloadPath = path.join(this.baseDir, 'preload.js');
    this.window = new BrowserWindow({
      width: 1000,
      height: 900,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        enableRemoteModule: false,
        nodeIntegration: true,
        webSecurity: true,
      },
    });

    // 创建右键菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '复制',
        accelerator: 'CmdOrCtrl+C',
        role: 'copy'
      },
      {
        label: '复制为 Markdown',
        click: (menuItem, browserWindow, event) => {
          const position = this.rightClickPosition;
          if (position) {
            this.window.webContents.send('context-menu-command', 'copy-as-markdown', {
              x: position.x,
              y: position.y
            });
          }
        }
      },
      {
        label: '粘贴',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste'
      },

      { type: 'separator' },
      {
        label: '删除当前对话',
        click: (menuItem, browserWindow, event) => {
          // 获取右键点击时的坐标位置
          const position = this.rightClickPosition;
          if (position) {
            this.window.webContents.send('context-menu-command', 'delete-current-message', {
              x: position.x,
              y: position.y
            });
          } else {
            // 如果没有坐标信息，仍然发送命令但不带坐标
            this.window.webContents.send('context-menu-command', 'delete-current-message', {});
          }
        }
      },
      {
        label: '清空全部对话',
        click: () => {
          this.window.webContents.send('context-menu-command', 'clear-all-messages');
        }
      }
    ]);

    // 监听右键点击事件以获取坐标
    this.window.webContents.on('context-menu', (event, params) => {
      this.rightClickPosition = {
        x: params.x,
        y: params.y
      };
      contextMenu.popup();
    });

    logger.info('Loading main window...');
    const url = path.join(this.baseDir, 'index.html');
    this.window.loadFile(url)
      .then(() => {
        logger.info('Main window loaded successfully.');
      })
      .catch((err) => {
        logger.error(`Failed to load main window: ${err}`);
      });
  }
}

export default MainWindow;
