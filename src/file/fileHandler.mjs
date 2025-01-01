import fs from 'fs';
import path from 'path';
import { Worker } from 'worker_threads';

class FileHandler {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.MAX_SAFE_SIZE = 2 ** 32 - 1;
  }

  async calculateMD5InWorker(filePath) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.resolve(this.baseDir, 'component/md5Worker.js'), {
        workerData: { filePath }
      });

      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }

  async listFiles(dirPath) {
    try {
      if (!dirPath || typeof dirPath !== 'string') {
        throw new Error('目录路径必须是字符串类型');
      }

      if (!fs.existsSync(dirPath)) {
        throw new Error(`目录不存在: ${dirPath}`);
      }

      const fileList = await this.readDirectoryRecursive(dirPath);

      return {
        success: true,
        data: fileList,
        path: dirPath
      };

    } catch (error) {
      console.error('列举文件失败:', error);
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  async readFile(filePath) {
    try {
      const stats = fs.statSync(filePath);
      const fileSizeInBytes = stats.size;

      if (fileSizeInBytes <= 0) {
        console.error('读取文件失败: 文件大小为0或负数', filePath);
        return {
          error: 'READ_ERROR',
          message: '文件大小为0或负数',
          path: filePath
        };
      }

      if (fileSizeInBytes >= this.MAX_SAFE_SIZE) {
        console.error('读取文件失败: 文件大小超过最大安全数组长度', filePath);
        return {
          error: 'READ_ERROR',
          message: '文件大小超过最大安全数组长度',
          path: filePath
        };
      }

      if (fileSizeInBytes > 10 * 1024 * 1024) { // 大文件
        const fileContent = await this.readFileInChunks(filePath);
        return fileContent;
      } else { // 小文件
        const buffer = fs.readFileSync(filePath);
        if (buffer.length <= 0) {
          console.error('读取文件失败: 缓冲区大小为0或负数', filePath);
          return {
            error: 'READ_ERROR',
            message: '缓冲区大小为0或负数',
            path: filePath
          };
        }
        if (buffer.length >= this.MAX_SAFE_SIZE) {
          console.error('读取文件失败: 缓冲区大小超过最大安全数组长度', filePath);
          return {
            error: 'READ_ERROR',
            message: '缓冲区大小超过最大安全数组长度',
            path: filePath
          };
        }
        return Array.from(new Uint8Array(buffer));
      }
    } catch (error) {
      console.error('读取文件失败:', error);
      return {
        error: 'READ_ERROR',
        message: error.message,
        path: filePath
      };
    }
  }

  async readDirectoryRecursive(dir) {
    let results = [];
    let stack = [dir];

    while (stack.length) {
      let currentDir = stack.pop();
      let list = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const dirent of list) {
        if (dirent.name.startsWith('.')) {
          continue;
        }

        const fileInfo = this.getSafeFileInfo(dirent, currentDir);
        if (fileInfo) {
          if (fileInfo.isDirectory) {
            stack.push(fileInfo.path);
          } else {
            results.push(fileInfo);
          }
        }

        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return results;
  }

  getSafeFileInfo(dirent, currentDir) {
    try {
      const fullPath = path.join(currentDir, dirent.name);
      const stats = fs.statSync(fullPath);

      return {
        name: dirent.name,
        path: fullPath,
        isDirectory: dirent.isDirectory(),
        size: stats.size,
        mtime: stats.mtime
      };
    } catch (error) {
      console.error('获取文件信息失败:', error);
      return null;
    }
  }

  async readFileInChunks(filePath) {
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
      const chunks = [];

      stream.on('data', chunk => {
        chunks.push(chunk);
      });

      stream.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        } catch (error) {
          reject(error);
        }
      });

      stream.on('error', error => {
        reject(error);
      });
    });
  }
}

export default FileHandler;
