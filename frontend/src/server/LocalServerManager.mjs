import { spawn } from 'child_process';
import PortManager from './PortManager.mjs';
import Store from 'electron-store';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs/promises';  // 添加 fs/promises 导入

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

    // 状态同步逻辑
    async syncState() {
        try {
            await this.acquireLock();
            
            const actualState = await this.checkProcessStatus();
            // 添加10%概率的日志输出
            if (Math.random() < 0.1) {
                console.log(`[StateSync] Desired: ${this.desiredState}, Actual: ${actualState}`);
            }

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
        try {
            this.startLock = true;
            
            // 确保没有遗留进程
            await this.cleanupExistingProcesses();
            
            this.currentPort = await this.portManager.findAvailablePort();
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

export default LocalServerManager;
