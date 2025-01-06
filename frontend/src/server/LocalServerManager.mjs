import { spawn } from 'child_process';
import PortManager from './PortManager.mjs';
import Store from 'electron-store';
import fetch from 'node-fetch';  // 添加 fetch 导入

class LocalServerManager {
    constructor() {
        this.javaProcess = null;
        this.isRunning = false;
        this.portManager = new PortManager();
        this.store = new Store();
        this.currentPort = null;
        // 从 store 中读取 desiredState，默认为 false
        this.desiredState = this.store.get('serverDesiredState', false);
        this.stateLock = false; // 状态同步锁
        
        // 启动状态同步任务
        this.startStateSyncTask();
        this.MAX_HEALTH_RETRIES = 5;  // 添加最大重试次数
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

    // 状态同步逻辑
    async syncState() {
        try {
            await this.acquireLock();
            
            const actualState = await this.checkProcessStatus();
            console.log(`[StateSync] Desired: ${this.desiredState}, Actual: ${actualState}`);

            if (this.desiredState && !actualState) {
                await this._startServer();
            } else if (!this.desiredState && actualState) {
                await this._stopServer();
            }
        } finally {
            this.releaseLock();
        }
    }

    // 健康检查方法
    async checkHealth(port, retryCount = 0) {
        try {
            const response = await fetch(`http://localhost:${port}/health`);
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

    // 对外的启动接口 - 立即返回
    async startServer(jarPath) {
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

    // 内部启动实现
    async _startServer() {
        if (this.isRunning) return;

        try {
            this.currentPort = await this.portManager.findAvailablePort();
            const args = [
                '-jar',
                this.jarPath,
                `--server.port=${this.currentPort}`
            ];

            this.javaProcess = spawn('java', args, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.javaProcess.stdout.on('data', (data) => {
                console.log(`[LocalServer] ${data}`);
                if (data.includes('Server started successfully')) {
                    this.store.set('javaProcess', { 
                        pid: this.javaProcess.pid, 
                        port: this.currentPort 
                    });
                    this.isRunning = true;
                }
            });

            this.javaProcess.stderr.on('data', (data) => {
                console.error(`[LocalServer Error] ${data}`);
            });

            this.javaProcess.on('exit', (code, signal) => {
                console.log(`[LocalServer] Process exited with code ${code} and signal ${signal}`);
                this.isRunning = false;
                this.javaProcess = null;
                this.store.delete('javaProcess');
            });

        } catch (error) {
            console.error('[LocalServer] Start error:', error);
            this.isRunning = false;
        }
    }

    // 内部停止实现
    async _stopServer() {
        if (!this.isRunning || !this.javaProcess) return;

        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', this.javaProcess.pid, '/f', '/t']);
            } else {
                this.javaProcess.kill('SIGTERM');
            }

            // 强制结束超时
            setTimeout(() => {
                if (this.javaProcess) {
                    this.javaProcess.kill('SIGKILL');
                }
            }, 5000);

        } catch (error) {
            console.error('[LocalServer] Stop error:', error);
        }
    }
}

export default LocalServerManager;
