import winston from 'winston';
import 'winston-daily-rotate-file';
import { app } from 'electron';
import path from 'path';

// 确保日志目录存在
const logDir = path.join(app.getPath('userData'), 'logs');

// 添加时区转换函数
function getBeijingTime() {
    const now = new Date();
    // 不需要手动转换时区，直接使用toLocaleString转换为北京时间
    return now.toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
        hour12: false
    }).replace(/[/]/g, '-');
}

// 自定义时间戳格式
const timestampFormat = winston.format((info) => {
    info.timestamp = getBeijingTime();
    return info;
});

const logFormat = winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} [${level}]: ${message}`;
});

// 创建一个新的 logger 实例
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        timestampFormat(),
        logFormat
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.DailyRotateFile({
            filename: path.join(logDir, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '14d',
            // 添加时区设置
            createSymlink: true,
            utc: false,
            localTime: true,
            // 日志文件使用本地时间
            dirname: logDir,
            auditFile: path.join(logDir, '.audit.json')
        })
    ]
});

export const getLogPath = () => logDir;
export default logger;
