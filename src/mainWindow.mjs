import { BrowserWindow } from 'electron';
import path from 'path';

class MainWindow {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.window = null;
  }

  create() {
    console.log('Creating main window...');
    this.window = new BrowserWindow({
      width: 1000,
      height: 800,
      webPreferences: {
        preload: path.join(this.baseDir, 'preload.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        nodeIntegration: true,
        webSecurity: true,
      },
    });

    this.window.loadFile(path.join(this.baseDir, 'index.html'))
      .then(() => {
        console.log('Main window loaded successfully.');
      })
      .catch((err) => {
        console.error('Failed to load main window:', err);
      });
  }
}

export default MainWindow;
