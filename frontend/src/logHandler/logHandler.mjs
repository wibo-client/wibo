import fs from 'fs/promises';
import path from 'path';
import { app } from 'electron';
import logger from '../utils/loggerUtils.mjs';

export default class LogHandler {
  constructor() {
    this.logPath = path.join(app.getPath('userData'), 'logs');
    this.defaultLineCount = 500;
  }

  getCurrentLogFile() {
    // 使用北京时间获取当前日期
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const beijingTime = new Date(utc + (3600000 * 8));
    const currentDate = beijingTime.toISOString().split('T')[0];
    const logFile = `application-${currentDate}.log`;
    return {
      date: currentDate,
      filename: logFile,
      fullPath: path.join(this.logPath, logFile)
    };
  }

  async init(globalContext) {
    this.globalContext = globalContext;

    try {
      await fs.mkdir(this.logPath, { recursive: true });
      // 添加初始化日志
      logger.info('Log handler initialized successfully');
    } catch (error) {
      console.error('Failed to create logs directory:', error);
    }
  }

  async getLogs(offset = 0, limit = this.defaultLineCount) {
    try {
      const logFileInfo = this.getCurrentLogFile();
      const currentLogFile = logFileInfo.fullPath;

      // 检查文件是否存在，如果不存在则创建
      try {
        await fs.access(currentLogFile);
      } catch {
        await fs.writeFile(currentLogFile, '', 'utf-8');
        logger.info('Created new log file');
        return {
          lines: ['Log file initialized'],
          hasMore: false,
          total: 1,
          logFile: logFileInfo
        };
      }

      const content = await fs.readFile(currentLogFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      // 直接从末尾开始获取指定数量的行，保持原始顺序
      const startIndex = Math.max(0, lines.length - limit);
      const endIndex = lines.length;

      return {
        lines: lines.slice(startIndex, endIndex),
        hasMore: startIndex > 0,
        total: lines.length,
        logFile: logFileInfo
      };
    } catch (error) {
      console.error('读取日志文件失败:', error);
      logger.error(`Failed to read logs: ${error.message}`);
      return {
        lines: [`Error reading logs: ${error.message}`],
        hasMore: false,
        total: 0,
        logFile: this.getCurrentLogFile()
      };
    }
  }

  // 修改 getLatestLogs 方法也返回日志文件信息
  async getLatestLogs(lastKnownTotal) {
    try {
      const logFileInfo = this.getCurrentLogFile();
      const currentLogFile = logFileInfo.fullPath;
      const content = await fs.readFile(currentLogFile, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      if (lines.length <= lastKnownTotal) {
        return { newLines: [], total: lines.length, logFile: logFileInfo };
      }

      // 获取新增的行，保持原始顺序
      return {
        newLines: lines.slice(lastKnownTotal),
        total: lines.length,
        logFile: logFileInfo
      };
    } catch (error) {
      console.error('读取最新日志失败:', error);
      return {
        newLines: [],
        total: lastKnownTotal,
        logFile: this.getCurrentLogFile()
      };
    }
  }
}
