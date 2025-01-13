import { BrowserWindow, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

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
    console.log('Base directory:', this.baseDir);
    // console.log('Preload script:', this.preloadPath);
  }

  create() {
    console.log('Creating main window...');
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

    console.log('Loading main window...');
    const url = path.join(this.baseDir, 'index.html');
    this.window.loadFile(url)
      .then(() => {
        console.log('Main window loaded successfully.');
      })
      .catch((err) => {
        console.error('Failed to load main window:', err);
      });
  }
}

export default MainWindow;
