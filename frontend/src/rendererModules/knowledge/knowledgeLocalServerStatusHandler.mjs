export default class KnowledgeLocalServerStatusHandler {
    constructor() {
        this.BASE_URL = null;
        this.currentState = {
            isHealthy: false,
            port: null,
            desiredState: false,
            debugMode: false,
            baseUrl : null
        };
        this.statesCheckCallbacks = new Set();

        // 不再直接启动定时更新，而是通过状态检查来控制
        this.checkServerStatus();
    }

    // 修改 setupPortCheck 方法
    async checkServerStatus() {
        const updateBaseUrl = async () => {
            try {
                const serverStatus = await window.electron.getServerDesiredState();
                const debugMode = Boolean(serverStatus.debugPort);

                // 调试模式下使用调试端口
                const activePort = debugMode ? serverStatus.debugPort : serverStatus.port;

                const newState = {
                    isHealthy: serverStatus.isHealthy || debugMode,  // 调试模式下默认为健康
                    port: activePort,
                    desiredState: serverStatus.desiredState || debugMode,  // 调试模式下视为已开启
                    debugMode,
                    baseUrl: activePort ? `http://localhost:${activePort}` : null,
                    pid: serverStatus.pid,
                    processExists :  serverStatus.processExists,
                    
                };
                this.currentState = newState;
                this.handleStateCheck(newState);
            } catch (error) {
                if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                    console.debug('[本地索引服务] 服务离线，等待重新连接...');
                } else {
                    console.error('[本地索引服务] 获取服务状态失败:', error.message);
                }
                this.currentState = {
                    isHealthy: false,
                    port: null,
                    desiredState: false,
                    debugMode: false,
                    baseUrl: null
                };
                return false;
            }
        };

        // 初始检查
        await updateBaseUrl();

        // 定期检查
        setInterval(async () => {
            await updateBaseUrl();
        }, 5000);
    }

    // 新增：状态变化处理方法
    handleStateCheck(newState) {
        this.updateUIState(newState);
        this.triggerStateCheckCallbacks(newState)
    }


    // 新增：UI状态更新方法
    updateUIState(state) {
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const configSection = document.getElementById('localKnowledgeBaseConfig');
        const toggle = document.getElementById('localKnowledgeBaseToggle');

        const processPid = document.getElementById('processPid');
        const processPort = document.getElementById('processPort');

        if (statusDot && statusText) {
            if (state.isHealthy) {
                statusDot.style.backgroundColor = '#4CAF50';
                statusText.textContent = state.debugMode ? '调试模式运行中' : '正常运行中';
                processPid.textContent = state.pid;
                processPort.textContent = state.port;
            } else if (state.desiredState) {
                statusDot.style.backgroundColor = '#FFA500';
                statusText.textContent = '启动中...';
                processPid.textContent = '-';
                processPort.textContent = '-';
            } else {
                statusDot.style.backgroundColor = '#9E9E9E';
                statusText.textContent = '已关闭';
                processPid.textContent = '-';
                processPort.textContent = '-';
            }
        }

        if (configSection && toggle) {
            toggle.checked = state.desiredState;
            configSection.style.display = state.desiredState ? 'block' : 'none';
        }
    }


    // 添加注册状态变化监听器的方法
    addStateCheckListener(callback) {
        this.statesCheckCallbacks.add(callback);
        return () => this.removeStateCheckListener(callback);
    }

    // 移除状态变化监听器
    removeStateCheckListener(callback) {
        this.statesCheckCallbacks.delete(callback);
    }

    // 通知所有监听器
    triggerStateCheckCallbacks(newState) {
        this.statesCheckCallbacks.forEach(callback => {
            try {
                callback(newState);
            } catch (error) {
                console.error('状态变化回调执行错误:', error);
            }
        });
    }
}