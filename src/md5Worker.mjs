// import { parentPort, workerData } from 'worker_threads';
// import fs from 'fs';
// import crypto from 'crypto';

// function calculatePartialMD5(filePath) {
//   try {
//     const ONE_MB = 1 * 1024 * 1024;
//     const stats = fs.statSync(filePath);
//     const fileSize = stats.size;
//     const hashSum = crypto.createHash('md5');

//     const fd = fs.openSync(filePath, 'r');
//     const buffer = Buffer.alloc(Math.min(ONE_MB, fileSize));
//     fs.readSync(fd, buffer, 0, buffer.length, 0);
//     fs.closeSync(fd);
//     hashSum.update(buffer);

//     return hashSum.digest('hex');
//   } catch (error) {
//     console.error(`MD5计算失败: ${filePath}`, error);
//     return null;
//   }
// }
//
// // 计算部分 MD5 并将结果发送回主线程
// const result = calculatePartialMD5(workerData.filePath);
// parentPort.postMessage(result);