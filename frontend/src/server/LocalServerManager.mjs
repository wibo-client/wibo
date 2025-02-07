import { spawn } from 'child_process';
import PortManager from './PortManager.mjs';
import Store from 'electron-store';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';  // 添加 fs/promises 导入
import { app } from 'electron';  // 添加这行导入
import logger from '../utils/loggerUtils.mjs';  // 添加 logger 导入
/*
gpt 生成的这个表太漂亮了，我直接贴出来。 

修改后的状态矩阵分析
前台标记打开server	持有PID	进程存续	状态描述	处理方案
✓ 已标记	✓ 有值	✓ 存在	正常状态	继续使用现有进程
✓ 已标记	✓ 有值	✗ 不存在	进程异常终止	清理PID并重启进程
✓ 已标记	✗ 空值	-	初始状态	启动新进程
✗ 未标记	✓ 有值	✓ 存在	需要关闭	关闭当前进程并清理PID
✗ 未标记	✓ 有值	✗ 不存在	状态残留	清理PID
✗ 未标记	✗ 空值	-	完全关闭	无需处理
*/

export default class LocalServerManager {
    constructor() {
        this.inited = false;
        this.portManager = new PortManager();
        this.store = new Store();
        this.portForDebug = ''; // 添加调试端口配置，可以根据需要修改端口号

        this.MAX_PROCESS_HISTORY = 5;

        // 启动状态同步任务
        this.startStateSyncTask();
        this.MAX_HEALTH_RETRIES = 5;  // 添加最大重试次数

        this.startTimeout = 180000;  // 启动超时时间改为3分钟
        this.stopTimeout = 30000;    // 停止超时时间设为30秒
        this.healthCheckInterval = 2000; // 健康检查间隔2秒
        this.jarPath = null; // 添加 jarPath 属性
        this.javaBinPath = null;  // 添加 Java 可执行文件路径

        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);

        if (app.isPackaged) {
            this.baseDir = path.join(process.resourcesPath, '');
        } else {
            this.baseDir = app.getAppPath();
        }

        this.initializePaths(); // 在构造函数中调用合并后的初始化方法
        this.cleanupHandlersRegistered = false; // 添加标记
    }

    async init(globalContext) {
        this.globalContext = globalContext;
        this.inited = true;
    }

    // 新增：获取 desiredState 方法
    getDesiredState() {
        return this.store.get('serverDesiredState', true);
    }

    // 新增：获取和设置 javaProcess 方法
    getJavaProcess() {
        return this.store.get('javaProcess');
    }

    // 获取进程历史记录
    getProcessHistory() {
        return this.store.get('javaProcessHistory', []);
    }

    // 设置进程信息，保留历史记录
    setJavaProcess(processInfo) {
        const history = this.getProcessHistory();
        const timestamp = Date.now();

        // 添加时间戳到进程信息
        const enhancedProcessInfo = {
            ...processInfo,
            timestamp,
            status: 'running'
        };

        // 添加新进程信息到历史记录
        history.unshift(enhancedProcessInfo);

        // 保持历史记录在限定大小内
        const trimmedHistory = history.slice(0, this.MAX_PROCESS_HISTORY);

        this.store.set('javaProcessHistory', trimmedHistory);
        this.store.set('javaProcess', enhancedProcessInfo);
    }

    deleteJavaProcess() {
        this.store.delete('javaProcess');
    }

    // 启动状态同步任务
    startStateSyncTask() {
        if (this.syncStateInterval) {
            clearInterval(this.syncStateInterval);
        }
        this.syncStateInterval = setInterval(async () => {
            await this.syncState();
        }, 10000); // 每5秒同步一次状态
    }

    // 增加状态检查方法
    isDebugMode() {
        return Boolean(this.portForDebug);
    }

    // 修改状态同步逻辑
    async syncState() {
        if (this.portManager.startLock === true) {
            logger.info('[StateManager] Server is starting, please wait...');
            return;
        }
        this.portManager.startLock = true;

        try {
            const serverInfo = await this.getCurrentServerInfo();
            const nextAction = this.determineNextAction(serverInfo);

            await this.executeAction(nextAction, serverInfo);

            // 发送状态更新到渲染进程
            if (process.send) {
                process.send({
                    type: 'serverStateUpdate',
                    data: {
                        isHealthy: serverInfo.processExists,
                        port: serverInfo.port,
                        desiredState: this.getDesiredState(),
                        debugPort: serverInfo.debugPort
                    }
                });
            }

        } finally {
            this.portManager.startLock = false;
        }
    }

    // 新增：获取当前服务器信息
    async getCurrentServerInfo() {
        const desiredState = this.getDesiredState();
        const savedProcess = this.getJavaProcess();
        const hasPid = Boolean(savedProcess?.pid);
        let processExists = false;

        if (this.isDebugMode() && this.portForDebug) {
            // 调试模式下，直接做健康检查
            try {
                processExists = await this.checkHealth(this.portForDebug);
                // 如果健康检查成功，保存调试进程信息
                if (processExists && !savedProcess) {
                    this.setJavaProcess({
                        port: this.portForDebug,
                        pid: 0  // 调试模式下不需要真实PID
                    });
                }
                // 如果健康检查成功，同步AK
                await this.syncApiKey(this.portForDebug);
            } catch (e) {
                processExists = false;
            }
        } else if (hasPid) {
            try {
                process.kill(savedProcess.pid, 0);
                processExists = await this.checkHealth(savedProcess.port);
                // 如果健康检查成功，同步AK
                if (processExists) {
                    await this.syncApiKey(savedProcess.port);
                }
            } catch (e) {
                processExists = false;
            }
        }

        return {
            desiredState,
            hasPid,
            processExists,
            pid: savedProcess?.pid,
            port: this.isDebugMode() ? this.portForDebug : savedProcess?.port,
            debugPort: this.isDebugMode() ? this.portForDebug : null,
            isHealthy: processExists
        };
    }

    // 新增：确定下一步动作
    determineNextAction(serverInfo) {
        const { desiredState, hasPid, processExists } = serverInfo;
        const debugMode = this.isDebugMode();

        // 状态矩阵处理
        if (desiredState) {
            if (hasPid) {
                if (processExists) {
                    return 'CONTINUE';  // 正常状态，继续使用
                } else {
                    // 调试模式下只清理PID，不重启
                    return debugMode ? 'CLEANUP' : 'RESTART';
                }
            } else {
                // 调试模式下不自动启动
                return debugMode ? 'WAIT' : 'START';
            }
        } else {
            if (hasPid) {
                if (processExists) {
                    return 'SHUTDOWN';  // 需要关闭进程
                } else {
                    return 'CLEANUP';   // 清理残留PID
                }
            } else {
                return 'NONE';        // 完全关闭状态，无需处理
            }
        }
    }

    // 新增：执行对应动作
    async executeAction(action, serverInfo) {
        // 只有2%概率输出日志
        if (Math.random() < 0.02) {
            logger.info(`[StateManager] Executing action: ${action}`);
        }

        switch (action) {
            case 'CONTINUE':
                // 正常状态，无需处理
                break;

            case 'RESTART':
                await this.cleanupExistingProcesses();
                await this._startServer();
                break;

            case 'START':
                await this._startServer();
                break;

            case 'SHUTDOWN':
                await this._stopServer();
                break;

            case 'CLEANUP':
                await this.cleanupExistingProcesses();
                break;

            case 'WAIT':
                logger.info('[StateManager] Debug mode: Waiting for manual process management');
                break;

            case 'NONE':
                // 完全关闭状态，无需处理
                break;
            default:
                logger.warn('[StateManager] Unknown action:', action);
                break;
        }
    }

    // 健康检查方法
    async checkHealth(port, retryCount = 0) {
        try {
            const response = await fetch(`http://localhost:${port}/health`);
            return response.ok;
        } catch (error) {
            // 如果是调试端口且是第一次检查，给予更长的等待时间
            if (port === this.portForDebug && retryCount === 0) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                return this.checkHealth(port, retryCount + 1);
            }

            if (retryCount < this.MAX_HEALTH_RETRIES) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.checkHealth(port, retryCount + 1);
            }

            return false;
        }
    }

    // 修改检查进程状态方法
    async checkProcessStatus() {
        const savedProcess = this.getJavaProcess();
        if (!savedProcess || !savedProcess.pid || !savedProcess.port) return false;

        try {
            // 检查进程是否存在
            process.kill(savedProcess.pid, 0);

            // 检查端口是否还在监听
            const isHealthy = await this.checkHealth(savedProcess.port);

            if (!isHealthy) {
                logger.warn('[ProcessCheck] Process exists but health check failed');
                return false;
            }

            // 检查进程是否是我们启动的Java进程（仅限非Windows平台）
            if (process.platform !== 'win32') {
                try {
                    const psOutput = await this.executeCommand('ps', ['-p', savedProcess.pid, '-o', 'command=']);
                    if (!psOutput.toLowerCase().includes('java')) {
                        logger.warn('[ProcessCheck] PID exists but is not a Java process');
                        return false;
                    }
                } catch (e) {
                    // 忽略ps命令执行错误
                }
            }

            return true;
        } catch (e) {
            logger.warn('[ProcessCheck] Process check failed:', e.message);
            this.deleteJavaProcess();
            return false;
        }
    }

    // 查找 jar 文件的辅助方法
    async findJarFile() {
        const possibleBasePaths = [
            path.join(this.baseDir, 'java-local-server'),
            path.join(this.baseDir, '..', 'java-local-server'),
            path.join(this.baseDir, '..', '..', 'java-local-server'),
            path.join(process.cwd(), 'java-local-server'),
        ];

        for (const basePath of possibleBasePaths) {
            logger.info(`[LocalServer] 尝试查找 jar 文件路径: ${basePath}`);
            try {
                const files = await fs.readdir(basePath);
                const jarFile = files.find(file => file.endsWith('.jar'));
                if (jarFile) {
                    const fullPath = path.join(basePath, jarFile);
                    logger.info(`[LocalServer] 找到 jar 文件: ${fullPath}`);
                    return fullPath;
                }
            } catch (error) {
                logger.debug(`[LocalServer] jar 文件路径不存在: ${basePath}`);
            }
        }

        logger.warn('[LocalServer] 未找到 jar 文件');
        return null;
    }

    // 合并后的初始化方法
    async initializePaths() {
        try {
            const platform = process.platform;
            const possibleBasePaths = [
                path.join(this.baseDir, 'java-local-server'),
                path.join(this.baseDir, '..', 'java-local-server'),
                path.join(this.baseDir, '..', '..', 'java-local-server'),
                path.join(process.cwd(), 'java-local-server'),
            ];

            const platformPaths = {
                win32: ['custom-jre', 'bin', 'java.exe'],
                darwin: ['custom-jre', 'bin', 'java'],
                linux: ['custom-jre', 'bin', 'java'],
            };

            const platformSubPath = platformPaths[platform];
            if (!platformSubPath) {
                logger.warn(`[LocalServer] 不支持的操作系统平台: ${platform}`);
                return;
            }

            for (const basePath of possibleBasePaths) {
                const fullPath = path.join(basePath, ...platformSubPath);
                logger.info(`[LocalServer] 尝试查找 Java 路径: ${fullPath}`);
                try {
                    await fs.access(fullPath, fs.constants.X_OK);
                    this.javaBinPath = fullPath;
                    logger.info(`[LocalServer] 找到 Java 路径: ${fullPath}`);
                    break;
                } catch (error) {
                    logger.debug(`[LocalServer] Java 路径不存在: ${fullPath}`);
                }
            }

            if (!this.javaBinPath) {
                this.javaBinPath = platform === 'win32' ? 'java.exe' : 'java';
                logger.warn('[LocalServer] 未找到本地 Java，将使用系统默认 Java');
            }

            const foundJarPath = await this.findJarFile();
            if (foundJarPath) {
                this.jarPath = foundJarPath;
                logger.info(`[LocalServer] Paths initialized: { java: ${this.javaBinPath}, jar: ${this.jarPath} }`);
            } else {
                logger.warn('[LocalServer] No jar file found during initialization');
            }
        } catch (error) {
            logger.error(`[LocalServer] Failed to initialize paths: ${error}`);
        }
    }

    // 对外的启动接口 - 立即返回
    async startServer() {
        try {
            // 确保 jarPath 已初始化
            if (!this.jarPath) {
                const foundJarPath = await this.findJarFile();
                if (!foundJarPath) {
                    this.store.set('serverDesiredState', false);
                    return {
                        success: false,
                        message: '未找到可执行的 jar 文件'
                    };
                }
                this.jarPath = foundJarPath;
            }

            this.store.set('serverDesiredState', true);
            return { success: true, message: '已设置启动指令' };
        } catch (error) {
            logger.error('[LocalServer] Start server error:', error);
            this.store.set('serverDesiredState', false);
            return {
                success: false,
                message: '启动服务器失败: ' + error.message
            };
        }
    }

    // 对外的停止接口 - 立即返回
    async stopServer() {
        this.store.set('serverDesiredState', false);
        return { success: true, message: '已设置停止指令' };
    }

    // 等待进程完全停止的方法
    async waitForProcessStop(pid) {
        for (let i = 0; i < 15; i++) { // 最多等待30秒
            try {
                process.kill(pid, 0);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (e) {
                return; // 进程已经不存在，返回
            }
        }
        // 如果进程还在，强制结束
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/PID', pid]);
            } else {
                process.kill(pid, 'SIGKILL');
            }
        } catch (e) {
            // 忽略错误
        }
    }

    // 修改启动方法
    async _startServer() {
        if (await this.checkProcessStatus()) return;

        // 调试模式下不启动新进程
        if (this.isDebugMode()) {
            logger.info('[LocalServer] Debug mode: Skipping server start');
            return;
        }

        // 确保路径都已初始化
        if (!this.jarPath || !this.javaBinPath) {
            try {
                await this.initializePaths();
                if (!this.jarPath || !this.javaBinPath) {
                    throw new Error('Required paths not available');
                }
            } catch (error) {
                logger.error(`[LocalServer] Failed to initialize paths: ${error}`);
                throw new Error('Cannot start server: required paths not found');
            }
        }

        // 如果使用系统 Java,不需要检查文件权限
        if (this.javaBinPath !== 'java' && this.javaBinPath !== 'java.exe') {
            try {
                await fs.access(this.javaBinPath, fs.constants.X_OK);
            } catch (error) {
                logger.error(`[LocalServer] Java binary not executable: ${error}`);
                throw new Error('Java binary not executable');
            }
        }

        let javaProcess;
        try {

            // 确保没有遗留进程
            await this.cleanupExistingProcesses();

            // 优先使用调试端口
            const currentPort = this.portForDebug || await this.portManager.findAvailablePort();
            logger.info(`[LocalServer] Using port: ${currentPort}${this.portForDebug ? ' (debug mode)' : ''}`);

            const args = [
                '-jar',
                this.jarPath,
                `--server.port=${currentPort}`,
                '--spring.profiles.active=product'
            ];

            // 使用 custom-jre 的 java 可执行文件启动进程
            javaProcess = spawn(this.javaBinPath, args, {
                // 不分离进程,这样父进程结束时子进程也会结束
                detached: false,
                // 继承父进程的标准输入输出
                stdio: 'pipe',
                // Windows下隐藏命令窗口
                windowsHide: true
            });

            // 移除错误的 process.setpgid 调用
            // 改用进程组管理
            if (process.platform !== 'win32') {
                try {
                    // 在Unix系统上使用kill命令确保进程组存在
                    await this.executeCommand('kill', ['-0', `-${javaProcess.pid}`]);
                } catch (e) {
                    // 忽略错误，因为第一次检查进程组可能不存在
                    logger.debug('[LocalServer] Process group check:', e.message);
                }
            }

            // 等待进程启动
            await new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkHealth = async () => {
                    try {
                        const isHealthy = await this.checkHealth(currentPort);
                        if (isHealthy) {
                            logger.info(`[LocalServer] Server is healthy on port: ${currentPort}`);
                            // 立即保存进程信息
                            this.setJavaProcess({
                                pid: javaProcess.pid,
                                port: currentPort
                            });
                            resolve();
                            return;
                        } else {
                            logger.info('[LocalServer] Health check failed, retrying...');
                        }
                    } catch (e) {
                        logger.info(`[LocalServer] Health check error: ${e.message}`);
                    }

                    if (Date.now() - startTime > this.startTimeout) {
                        reject(new Error('Server start timeout'));
                        return;
                    }

                    setTimeout(checkHealth, this.healthCheckInterval);
                };

                javaProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    logger.info(`[LocalServer] ${output}`);
                    // 不再依赖输出判断启动状态，完全依赖健康检查
                });

                javaProcess.stderr.on('data', (data) => {
                    logger.error(`[LocalServer Error] ${data}`);
                });

                javaProcess.on('error', (error) => {
                    reject(error);
                });

                javaProcess.on('exit', async (code, signal) => {
                    if (!await this.checkProcessStatus()) {
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });
                logger.info('[LocalServer] Server starting');
                // 开始健康检查
                checkHealth();

            });

            // 确保清理处理器只注册一次
            if (!this.cleanupHandlersRegistered) {
                const cleanup = () => {
                    try {
                        if (javaProcess) {
                            if (process.platform === 'win32') {
                                spawn('taskkill', ['/F', '/T', '/PID', javaProcess.pid.toString()]);
                            } else {
                                // 改为使用 SIGKILL 信号强制终止
                                process.kill(-javaProcess.pid, 'SIGKILL');
                            }
                        }
                    } catch (err) {
                        logger.error('Error cleaning up java process:', err);
                    }
                };

                // 监听父进程的退出事件
                process.on('exit', cleanup);
                process.on('SIGTERM', cleanup);
                process.on('SIGINT', cleanup);
                process.on('SIGQUIT', cleanup);

                this.cleanupHandlersRegistered = true;
            }

        } catch (error) {
            logger.error(`[LocalServer] Start error: ${error}`);
            throw error; // 向上传递错误
        } finally {
        }
    }

    // 修改清理进程方法
    async cleanupExistingProcesses() {
        const savedProcess = this.getJavaProcess();
        if (!savedProcess || !savedProcess.pid) return;

        // 调试模式下，如果端口匹配则保留进程
        if (this.isDebugMode() && savedProcess.port === this.portForDebug) {
            logger.info('[LocalServer] Debug mode: Keeping debug process alive');
            return;
        }

        try {
            if (process.platform === 'win32') {
                // Windows上使用taskkill终止整个进程树
                await new Promise(resolve => {
                    spawn('taskkill', ['/F', '/T', '/PID', savedProcess.pid.toString()]).on('exit', resolve);
                });
            } else {
                // Unix系统上先尝试温和终止进程组
                try {
                    process.kill(savedProcess.pid, 'SIGTERM');
                    // 给进程一些时间来优雅退出
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    // 如果进程还在，强制终止
                    try {
                        process.kill(savedProcess.pid, 'SIGKILL');
                    } catch (e) {
                        // 进程可能已经退出，忽略错误
                    }
                } catch (e) {
                    logger.debug('[LocalServer] Process already terminated:', e.message);
                }
            }

            // 清理存储的进程信息
            this.deleteJavaProcess();
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (e) {
            logger.error('[LocalServer] Error cleaning up process:', e);
        }
    }

    // 修改停止方法
    async _stopServer() {
        if (!await this.checkProcessStatus()) return;

        // 调试模式下不停止进程
        const savedProcess = this.getJavaProcess();
        if (this.isDebugMode() && savedProcess.port === this.portForDebug) {
            logger.info('[LocalServer] Debug mode: Skipping server stop');
            return;
        }

        try {
            const pid = savedProcess.pid;
            logger.info('[LocalServer] Stopping server... PID: ' + pid);

            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', pid, '/f', '/t']);
            } else {
                // 首先发送 SIGTERM 信号

                process.kill(pid, 'SIGTERM');
                process.kill(pid, 'SIGKILL');
                logger.info('[LocalServer] Sent SIGKILL signal');

            }

            this.deleteJavaProcess();
            logger.info('[LocalServer] Server stopped');
        } catch (error) {
            logger.error('[LocalServer] Stop error:', error);
        }
    }

    // 新增：同步API密钥的方法
    async syncApiKey(port) {
        if (this.inited === false) {
            return;
        }
        try {
            const apiKey = await this.globalContext.configHandler.getModelSK();
            if (!apiKey) {
                console.log('No API key available to sync');
                return;
            }

            const response = await fetch(`http://localhost:${port}/admin/save-ak`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ak: apiKey })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            //console.log('Successfully synced API key with Java server');
        } catch (error) {
            console.error('Failed to sync API key:', error);
            // 不抛出错误，因为这是辅助功能
        }
    }

    // 添加资源释放方法
    async destroy() {
        // 清理所有进程
        await this.cleanupExistingProcesses();

        // 清理状态同步定时器
        if (this.syncStateInterval) {
            clearInterval(this.syncStateInterval);
        }

        // 重置状态
        this.inited = false;
        this.store.set('serverDesiredState', false);
    }

    // 添加辅助方法执行系统命令
    async executeCommand(command, args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(command, args);
            let output = '';

            proc.stdout.on('data', (data) => {
                output += data.toString();
            });

            proc.on('error', reject);
            proc.on('close', (code) => {
                if (code === 0) {
                    resolve(output.trim());
                } else {
                    reject(new Error(`Command failed with code ${code}`));
                }
            });
        });
    }
}
