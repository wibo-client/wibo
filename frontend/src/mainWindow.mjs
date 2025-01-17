import { BrowserWindow, app, Menu, clipboard } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/loggerUtils.mjs';

class MainWindow {
  constructor() {
    this.baseDir = null;
    this.window = null;
    this.preloadPath = null;
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
        label: '粘贴',
        accelerator: 'CmdOrCtrl+V',
        role: 'paste'
      }
    ]);

    this.window.webContents.on('context-menu', (event) => {
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
