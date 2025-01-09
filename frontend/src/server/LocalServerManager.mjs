import { spawn } from 'child_process';
import PortManager from './PortManager.mjs';
import Store from 'electron-store';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs/promises';  // 添加 fs/promises 导入
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
        this.javaProcess = null;
        this.isRunning = false;
        this.portManager = new PortManager();
        this.store = new Store();
        this.currentPort = null;
        this.portForDebug = null; // 添加调试端口配置，可以根据需要修改端口号
        // 从 store 中读取 desiredState，默认为 false
        this.desiredState = this.store.get('serverDesiredState', false);
        this.stateLock = false; // 状态同步锁

        // 启动状态同步任务
        this.startStateSyncTask();
        this.MAX_HEALTH_RETRIES = 5;  // 添加最大重试次数
        this.startLock = false;  // 添加启动锁
        this.startTimeout = 180000;  // 启动超时时间改为3分钟
        this.stopTimeout = 30000;    // 停止超时时间设为30秒
        this.healthCheckInterval = 2000; // 健康检查间隔2秒
    }

    // 获取状态同步锁
    async acquireLock() {
        while (this.stateLock) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        this.stateLock = true;
    }

    // 释放状态同步锁
    releaseLock() {
        this.stateLock = false;
    }

    // 启动状态同步任务
    startStateSyncTask() {
        setInterval(async () => {
            await this.syncState();
        }, 5000); // 每5秒同步一次状态
    }

    // 增加状态检查方法
    isDebugMode() {
        return Boolean(this.portForDebug);
    }

    // 修改状态同步逻辑
    async syncState() {
        try {
            await this.acquireLock();

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
                        desiredState: this.desiredState,
                        debugPort: serverInfo.debugPort
                    }
                });
            }

        } finally {
            this.releaseLock();
        }
    }

    // 新增：获取当前服务器信息
    async getCurrentServerInfo() {
        const desiredState = this.desiredState;
        const savedProcess = this.store.get('javaProcess');
        const hasPid = Boolean(savedProcess?.pid);
        let processExists = false;

        if (hasPid) {
            try {
                process.kill(savedProcess.pid, 0);
                const isHealthy = await this.checkHealth(savedProcess.port);
                processExists = isHealthy;
            } catch (e) {
                processExists = false;
            }
        }

        return {
            desiredState,
            hasPid,
            processExists,
            pid: savedProcess?.pid,
            port: savedProcess?.port,
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
        }
    }

    // 健康检查方法
    async checkHealth(port, retryCount = 0) {
        try {
            //console.log(`[HealthCheck] Checking health on port ${port}`);
            const response = await fetch(`http://localhost:${port}/health`);
            //console.log(`[HealthCheck] Response status:`, response.status);
            return response.ok;
        } catch (error) {
            console.warn(`[HealthCheck] Failed attempt ${retryCount + 1}:`, error.message);

            if (retryCount < this.MAX_HEALTH_RETRIES) {
                // 等待一秒后重试
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.checkHealth(port, retryCount + 1);
            }

            return false;
        }
    }

    // 修改检查进程状态方法
    async checkProcessStatus() {
        if (!this.javaProcess) {
            const savedProcess = this.store.get('javaProcess');
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
                    this.store.delete('javaProcess');
                    return false;
                }
                this.savedProcess = savedProcess;

                // 进程正常且健康
                this.currentPort = savedProcess.port;
                this.isRunning = true;
                return true;

            } catch (e) {
                console.warn('[ProcessCheck] Process check failed:', e.message);
                this.store.delete('javaProcess');
                return false;
            }
        }

        // 如果进程已经在运行，也要做健康检查
        if (this.isRunning && this.currentPort) {
            const isHealthy = await this.checkHealth(this.currentPort);
            if (!isHealthy) {
                console.warn('[ProcessCheck] Running process health check failed');
                this.isRunning = false;
                this.javaProcess = null;
                this.store.delete('javaProcess');
                return false;
            }
        }

        return this.isRunning;
    }

    // 查找 jar 文件的辅助方法
    async findJarFile() {
        const javaLocalServerPath = path.join(__dirname, 'java-local-server');
        try {
            const files = await fs.readdir(javaLocalServerPath);
            const jarFile = files.find(file => file.endsWith('.jar'));
            return jarFile ? path.join(javaLocalServerPath, jarFile) : null;
        } catch (error) {
            console.error('[LocalServer] Error finding jar file:', error);
            return null;
        }
    }

    // 对外的启动接口 - 立即返回
    async startServer() {
        const jarPath = await this.findJarFile();
        if (!jarPath) {
            this.desiredState = false;
            this.store.set('serverDesiredState', false);
            return {
                success: false,
                message: '未找到可执行的 jar 文件'
            };
        }

        this.jarPath = jarPath; // 保存 jarPath 供内部使用
        this.desiredState = true;
        this.store.set('serverDesiredState', true);
        return { success: true, message: '已设置启动指令' };
    }

    // 对外的停止接口 - 立即返回
    async stopServer() {
        this.desiredState = false;
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
        if (this.isRunning) return;
        if (this.startLock) {
            console.log('[LocalServer] Server is starting, please wait...');
            return;
        }

        // 调试模式下不启动新进程
        if (this.isDebugMode()) {
            console.log('[LocalServer] Debug mode: Skipping server start');
            return;
        }

        try {
            this.startLock = true;

            // 确保没有遗留进程
            await this.cleanupExistingProcesses();

            // 优先使用调试端口
            this.currentPort = this.portForDebug || await this.portManager.findAvailablePort();
            console.log(`[LocalServer] Using port: ${this.currentPort}${this.portForDebug ? ' (debug mode)' : ''}`);

            const args = [
                '-jar',
                this.jarPath,
                `--server.port=${this.currentPort}`,
                '--spring.profiles.active=product'
            ];

            this.javaProcess = spawn('java', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // 等待进程启动
            await new Promise((resolve, reject) => {
                const startTime = Date.now();
                const checkHealth = async () => {
                    try {
                        const isHealthy = await this.checkHealth(this.currentPort);
                        if (isHealthy) {
                            console.log('[LocalServer] Server is healthy on port:', this.currentPort);
                            // 立即保存进程信息
                            this.store.set('javaProcess', {
                                pid: this.javaProcess.pid,
                                port: this.currentPort
                            });
                            this.isRunning = true;
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

                this.javaProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log(`[LocalServer] ${output}`);
                    // 不再依赖输出判断启动状态，完全依赖健康检查
                });

                this.javaProcess.stderr.on('data', (data) => {
                    console.error(`[LocalServer Error] ${data}`);
                });

                this.javaProcess.on('error', (error) => {
                    reject(error);
                });

                this.javaProcess.on('exit', (code, signal) => {
                    if (!this.isRunning) {
                        reject(new Error(`Process exited with code ${code}`));
                    }
                });
                console.log('[LocalServer] Server starting ');
                // 开始健康检查
                checkHealth();

            });

        } catch (error) {
            console.error('[LocalServer] Start error:', error);
            this.isRunning = false;
            if (this.javaProcess) {
                try {
                    this.javaProcess.kill('SIGKILL');
                } catch (e) {
                    // 忽略关闭错误
                }
            }
            throw error; // 向上传递错误
        } finally {
            this.startLock = false;
        }
    }

    // 修改清理进程方法
    async cleanupExistingProcesses() {
        const savedProcess = this.store.get('javaProcess');
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
            this.store.delete('javaProcess');
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (e) {
            console.error('[LocalServer] Error cleaning up process:', e);
        }
    }

    // 修改停止方法
    async _stopServer() {
        if (!this.isRunning || !this.javaProcess) return;

        // 调试模式下不停止进程
        if (this.isDebugMode() && this.currentPort === this.portForDebug) {
            console.log('[LocalServer] Debug mode: Skipping server stop');
            this.isRunning = false;
            this.javaProcess = null;
            return;
        }

        try {
            const pid = this.javaProcess.pid;
            console.log('[LocalServer] Stopping server...');
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', pid, '/f', '/t']);
            } else {
                this.javaProcess.kill('SIGTERM');
            }

            // 等待进程完全停止
            await this.waitForProcessStop(pid);

            this.isRunning = false;
            this.javaProcess = null;
            this.store.delete('javaProcess');
            console.log('[LocalServer] Server stopped');
        } catch (error) {
            console.error('[LocalServer] Stop error:', error);
        }
    }
}
