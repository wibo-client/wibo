import winston from 'winston';
import 'winston-daily-rotate-file';
import { app } from 'electron';
import path from 'path';

// 确保日志目录存在
const logDir = path.join(app.getPath('userData'), 'logs');

const logFormat = winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level}]: ${message}`;
});

// 创建一个新的 logger 实例
const logger = winston.createLogger({
    level: 'info', // 确保日志级别为 info 或更低
    format: winston.format.combine(
        winston.format.timestamp(),
        logFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d'
        })
    ]
});

export default logger;
