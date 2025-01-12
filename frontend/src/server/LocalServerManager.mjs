import { spawn } from 'child_process';
import PortManager from './PortManager.mjs';
import Store from 'electron-store';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs/promises';  // 添加 fs/promises 导入
import { app } from 'electron';  // 添加这行导入
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
        this.portManager = new PortManager();
        this.store = new Store();
        this.portForDebug = ''; // 添加调试端口配置，可以根据需要修改端口号

        // 启动状态同步任务
        this.startStateSyncTask();
        this.MAX_HEALTH_RETRIES = 5;  // 添加最大重试次数
       
        this.startTimeout = 180000;  // 启动超时时间改为3分钟
        this.stopTimeout = 30000;    // 停止超时时间设为30秒
        this.healthCheckInterval = 2000; // 健康检查间隔2秒
        this.jarPath = null; // 添加 jarPath 属性
        this.javaBinPath = null;  // 添加 Java 可执行文件路径
        this.initializeJarPath(); // 在构造函数中调用初始化
        this.initializeJavaPaths(); // 在构造函数中调用初始化
    }

    // 新增：获取 desiredState 方法
    getDesiredState() {
        return this.store.get('serverDesiredState', false);
    }

    // 新增：获取和设置 javaProcess 方法
    getJavaProcess() {
        return this.store.get('javaProcess');
    }

    setJavaProcess(processInfo) {
        this.store.set('javaProcess', processInfo);
    }

    deleteJavaProcess() {
        this.store.delete('javaProcess');
    }
    
    // 启动状态同步任务
    startStateSyncTask() {
        setInterval(async () => {
            await this.syncState();
        }, 10000); // 每5秒同步一次状态
    }

    // 增加状态检查方法
    isDebugMode() {
        return Boolean(this.portForDebug);
    }

    // 修改状态同步逻辑
    async syncState() {
        if(this.portManager.startLock === true) {
            console.log('[StateManager] Server is starting, please wait...');
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
            } catch (e) {
                processExists = false;
            }
        } else if (hasPid) {
            try {
                process.kill(savedProcess.pid, 0);
                processExists = await this.checkHealth(savedProcess.port);
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
        console.log(`[StateManager] Executing action: ${action}`);

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
                console.log('[StateManager] Debug mode: Waiting for manual process management');
                break;

            case 'NONE':
                // 完全关闭状态，无需处理
                break;
            default:
                console.warn('[StateManager] Unknown action:', action);
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
        if (!this.javaProcess) {
            const savedProcess = this.getJavaProcess();
            if (!savedProcess) return false;

            try {
                // 首先检查进程是否存在
                process.kill(savedProcess.pid, 0);

                // 进程存在，继续检查健康状态
                const isHealthy = await this.checkHealth(savedProcess.port);

                if (!isHealthy) {
                    console.warn('[ProcessCheck] Process exists but health check failed');

                    // 尝试终止进程
                    try {
                        if (process.platform === 'win32') {
                            spawn('taskkill', ['/pid', savedProcess.pid, '/f', '/t']);
                        } else {
                            process.kill(savedProcess.pid, 'SIGTERM');
                            // 给进程一些时间来完成终止
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            // 如果进程还在，强制终止
                            try {
                                process.kill(savedProcess.pid, 'SIGKILL');
                            } catch (e) {
                                // 忽略错误，因为进程可能已经终止
                            }
                        }
                    } catch (killError) {
                        console.error('[ProcessCheck] Failed to kill unhealthy process:', killError);
                    }

                    // 清理存储的进程信息
                    this.deleteJavaProcess();
                    return false;
                }
                this.savedProcess = savedProcess;

                // 进程正常且健康
                return true;

            } catch (e) {
                console.warn('[ProcessCheck] Process check failed:', e.message);
                this.deleteJavaProcess();
                return false;
            }
        }

        // 如果进程已经在运行，也要做健康检查
        const savedProcess = this.getJavaProcess();
        if (savedProcess) {
            const isHealthy = await this.checkHealth(savedProcess.port);
            if (!isHealthy) {
                console.warn('[ProcessCheck] Running process health check failed');
                this.javaProcess = null;
                this.deleteJavaProcess();
                return false;
            }
        }

        return true;
    }

    // 查找 jar 文件的辅助方法
    async findJarFile() {
        let javaLocalServerPath;
        if (app.isPackaged) {
            const resourcesDir = path.join(path.dirname(process.execPath), '..', 'Resources');
            javaLocalServerPath = path.join(resourcesDir, 'java-local-server');
            console.log('[LocalServer] Using packaged path:', javaLocalServerPath);
        } else {
            // 开发环境中的路径
            javaLocalServerPath = path.join(__dirname, 'java-local-server');
            console.log('[LocalServer] Using development path:', javaLocalServerPath);
        }

        try {
            const files = await fs.readdir(javaLocalServerPath);
            const jarFile = files.find(file => file.endsWith('.jar'));
            return jarFile ? path.join(javaLocalServerPath, jarFile) : null;
        } catch (error) {
            console.error('[LocalServer] Error finding jar file:', error);
            return null;
        }
    }

    // 新增：初始化 jarPath 方法
    async initializeJarPath() {
        try {
            const foundJarPath = await this.findJarFile();
            if (foundJarPath) {
                this.jarPath = foundJarPath;
                console.log('[LocalServer] Jar file initialized:', this.jarPath);
            } else {
                console.warn('[LocalServer] No jar file found during initialization');
            }
        } catch (error) {
            console.error('[LocalServer] Failed to initialize jar path:', error);
        }
    }

    // 新增：初始化 Java 相关路径
    async initializeJavaPaths() {
        try {
            let javaLocalServerPath;
            if (app.isPackaged) {
                const resourcesDir = path.join(path.dirname(process.execPath), '..', 'Resources');
                javaLocalServerPath = path.join(resourcesDir, 'java-local-server');
                console.log('[LocalServer] Using packaged path for JRE:', javaLocalServerPath);
            } else {
                // 开发环境中的路径
                javaLocalServerPath = path.join(__dirname, 'java-local-server');
                console.log('[LocalServer] Using development path for JRE:', javaLocalServerPath);
            }
            
            // 根据平台找到正确的 Java 可执行文件路径
            const customJrePath = path.join(javaLocalServerPath, 'custom-jre');
            if (process.platform === 'win32') {
                this.javaBinPath = path.join(customJrePath, 'bin', 'java.exe');
            } else {
                this.javaBinPath = path.join(customJrePath, 'bin', 'java');
            }

            // 初始化 jar 文件路径
            const foundJarPath = await this.findJarFile();
            if (foundJarPath) {
                this.jarPath = foundJarPath;
                console.log('[LocalServer] Paths initialized:', {
                    java: this.javaBinPath,
                    jar: this.jarPath
                });
            } else {
                console.warn('[LocalServer] No jar file found during initialization');
            }
        } catch (error) {
            console.error('[LocalServer] Failed to initialize paths:', error);
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
            console.error('[LocalServer] Start server error:', error);
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
            console.log('[LocalServer] Debug mode: Skipping server start');
            return;
        }

        // 确保路径都已初始化
        if (!this.jarPath || !this.javaBinPath) {
            try {
                await this.initializeJavaPaths();
                if (!this.jarPath || !this.javaBinPath) {
                    throw new Error('Required paths not available');
                }
            } catch (error) {
                console.error('[LocalServer] Failed to initialize paths:', error);
                throw new Error('Cannot start server: required paths not found');
            }
        }

        // 确保 Java 可执行文件存在且可执行
        try {
            await fs.access(this.javaBinPath, fs.constants.X_OK);
        } catch (error) {
            console.error('[LocalServer] Java binary not executable:', error);
            throw new Error('Java binary not executable');
        }

        let javaProcess;
        try {

            // 确保没有遗留进程
            await this.cleanupExistingProcesses();

            // 优先使用调试端口
            const currentPort = this.portForDebug || await this.portManager.findAvailablePort();
            console.log(`[LocalServer] Using port: ${currentPort}${this.portForDebug ? ' (debug mode)' : ''}`);

            const args = [
                '-jar',
                this.jarPath,
                `--server.port=${currentPort}`,
                '--spring.profiles.active=product'
            ];

            // 使用 custom-jre 的 java 可执行文件启动进程
            javaProcess = spawn(this.javaBinPath, args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // 等待进程启动
            await new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkHealth = async () => {
                    try {
                        const isHealthy = await this.checkHealth(currentPort);
                        if (isHealthy) {
                            console.log('[LocalServer] Server is healthy on port:', currentPort);
                            // 立即保存进程信息
                            this.setJavaProcess({
                                pid: javaProcess.pid,
                                port: currentPort
                            });
                            resolve();
                            return;
                        } else {
                            console.log('[LocalServer] Health check failed, retrying...');
                        }
                    } catch (e) {
                        console.log('[LocalServer] Health check error:', e.message);
                    }

                    if (Date.now() - startTime > this.startTimeout) {
                        reject(new Error('Server start timeout'));
                        return;
                    }

                    setTimeout(checkHealth, this.healthCheckInterval);
                };

                javaProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log(`[LocalServer] ${output}`);
                    // 不再依赖输出判断启动状态，完全依赖健康检查
                });

                javaProcess.stderr.on('data', (data) => {
                    console.error(`[LocalServer Error] ${data}`);
                });

                javaProcess.on('error', (error) => {
                    reject(error);
                });

                javaProcess.on('exit', async (code, signal) => {
                    if (!await this.checkProcessStatus()) {
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });
                console.log('[LocalServer] Server starting ');
                // 开始健康检查
                checkHealth();

            });

        } catch (error) {
            console.error('[LocalServer] Start error:', error);
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
            console.log('[LocalServer] Debug mode: Keeping debug process alive');
            return;
        }

        try {
            if (process.platform === 'win32') {
                await new Promise(resolve => {
                    spawn('taskkill', ['/F', '/PID', savedProcess.pid]).on('exit', resolve);
                });
            } else {
                try {
                    process.kill(savedProcess.pid, 'SIGTERM');
                    await this.waitForProcessStop(savedProcess.pid);
                } catch (e) {
                    // 如果进程已经不存在，忽略错误
                    console.log('[LocalServer] Process already terminated:', e.message);
                }
            }

            // 清理存储的进程信息
            this.deleteJavaProcess();
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (e) {
            console.error('[LocalServer] Error cleaning up process:', e);
        }
    }

    // 修改停止方法
    async _stopServer() {
        if (!await this.checkProcessStatus()) return;

        // 调试模式下不停止进程
        const savedProcess = this.getJavaProcess();
        if (this.isDebugMode() && savedProcess.port === this.portForDebug) {
            console.log('[LocalServer] Debug mode: Skipping server stop');
            return;
        }

        try {
            const pid = savedProcess.pid;
            console.log('[LocalServer] Stopping server... PID:', pid);
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', pid, '/f', '/t']);
            } else {
                process.kill(pid, 'SIGTERM');
            }

            // 等待进程完全停止
            await this.waitForProcessStop(pid);

            this.deleteJavaProcess();
            console.log('[LocalServer] Server stopped');
        } catch (error) {
            console.error('[LocalServer] Stop error:', error);
        }
    }
}
