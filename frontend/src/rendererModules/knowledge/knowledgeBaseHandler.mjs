export default class KnowledgeBaseHandler {
  constructor() {
    this.BASE_URL = null;
    this.updateTimer = null;  // 添加定时器引用
    this.isUpdatingUI = false; // 添加UI更新锁定标志
    this.uiLockTimeout = null; // 添加UI锁定计时器
    this.setupEventListeners();
    this.lastServerState = null; // 添加状态缓存
    this.lastKnownState = {
      isHealthy: false,
      port: null,
      desiredState: false,
      debugMode: false
    };
    this.stateChangeCallbacks = new Set();

    // 不再直接启动定时更新，而是通过状态检查来控制
    this.setupPortCheck();
    this.componentDidMount(); // 在构造函数中调用
    this.initializeIndexSettings(); // 在构造函数中调用初始化方法
    this.setupIndexSettingsListeners(); // 添加新的方法调用
  }

  // 添加定时器控制方法
  startUpdateTimer() {
    if (!this.updateTimer) {
      this.updateMonitoredDirs(); // 立即执行一次
      this.updateTimer = setInterval(() => this.updateMonitoredDirs(), 30000); // 改为30秒轮询一次
      console.log('[KnowledgeBase] Started update timer');
    }
  }

  stopUpdateTimer() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
      console.log('[KnowledgeBase] Stopped update timer');
    }
  }

  // 新增：状态变化处理方法
  handleStateChange(newState) {
    const stateChanged = JSON.stringify(newState) !== JSON.stringify(this.lastKnownState);

    if (stateChanged) {
      this.lastKnownState = { ...newState };
      this.updateUIState(newState);
      this.stateChangeCallbacks.forEach(callback => callback(newState));
    }
  }

  // 新增：UI状态更新方法
  updateUIState(state) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const configSection = document.getElementById('localKnowledgeBaseConfig');
    const toggle = document.getElementById('localKnowledgeBaseToggle');

    if (statusDot && statusText) {
      if (state.isHealthy) {
        statusDot.style.backgroundColor = '#4CAF50';
        statusText.textContent = state.debugMode ? '调试模式运行中' : '正常运行中';
      } else if (state.desiredState) {
        statusDot.style.backgroundColor = '#FFA500';
        statusText.textContent = '启动中...';
      } else {
        statusDot.style.backgroundColor = '#9E9E9E';
        statusText.textContent = '已关闭';
      }
    }

    if (configSection && toggle) {
      toggle.checked = state.desiredState;
      configSection.style.display = state.desiredState ? 'block' : 'none';
    }
  }

  // 修改 setupPortCheck 方法，增加状态转换处理
  async setupPortCheck() {
    const updateBaseUrl = async () => {
      try {
        const serverStatus = await window.electron.getServerDesiredState();
        // 添加调试模式检测
        const debugMode = Boolean(serverStatus.debugPort);

        const newState = {
          isHealthy: serverStatus.isHealthy,
          port: serverStatus.port,
          desiredState: serverStatus.desiredState,
          debugMode
        };

        this.handleStateChange(newState);

        if (serverStatus.isHealthy && serverStatus.port) {
          this.BASE_URL = `http://localhost:${serverStatus.port}`;
          // 非调试模式才启动定时更新
          if (!debugMode) {
            this.startUpdateTimer();
          }
          await this.initializeIndexSettings(); // 服务启动后初始化索引设置
          return true;
        } else {
          this.BASE_URL = null;
          this.stopUpdateTimer();  // 服务离线时停止定时器
          return false;
        }
      } catch (error) {
        console.error('Failed to get server status:', error);
        this.BASE_URL = null;
        this.stopUpdateTimer();  // 出错时停止定时器
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

  // 添加初始化索引设置方法
  async initializeIndexSettings() {
    if (!this.BASE_URL) {
      console.warn('[KnowledgeBase] Service not available, cannot fetch index settings');
      return;
    }
    if (this.isUpdatingUI) {
      console.log('[KnowledgeBase] UI is locked, skipping update');
      return; // 如果UI正在被用户操作，跳过更新
    }

    try {
      const response = await fetch(`${this.BASE_URL}/admin/current-index-settings`);
      const settings = await response.json();

      // 更新文件类型开关状态
      if (settings.fileTypes) {
        // 基础文件类型
        const simpleTypes = ['text', 'spreadsheet', 'web', 'code', 'config', 'archive'];
        simpleTypes.forEach(type => {
          const toggle = document.getElementById(`${type}FilesToggle`);
          if (toggle) {
            toggle.checked = settings.fileTypes[type] || false;
          }
        });

        // 带增强选项的文件类型
        const enhancedTypes = ['presentation', 'pdf', 'image'];
        enhancedTypes.forEach(type => {
          const typeToggle = document.getElementById(`${type}FilesToggle`);
          const enhanceToggle = document.getElementById(`${type}EnhanceToggle`);

          if (typeToggle && settings.fileTypes[type]) {
            typeToggle.checked = settings.fileTypes[type].enabled || false;
          }
          if (enhanceToggle && settings.fileTypes[type]) {
            enhanceToggle.checked = settings.fileTypes[type].enhanced || false;
          }
        });
      }

      // 更新忽略目录设置
      const ignoredDirs = document.getElementById('ignoredDirectories');
      if (ignoredDirs && settings.ignoredDirectories) {
        ignoredDirs.value = settings.ignoredDirectories.join('\n');
      }

      console.log('[KnowledgeBase] Index settings initialized');
    } catch (error) {
      console.error('[KnowledgeBase] Failed to fetch index settings:', error);
    }
  }

  async componentDidMount() {
    try {
      const serverStatus = await window.electron.getServerDesiredState();
      const localKnowledgeBaseToggle = document.getElementById('localKnowledgeBaseToggle');
      const localKnowledgeBaseConfig = document.getElementById('localKnowledgeBaseConfig');

      if (localKnowledgeBaseToggle && localKnowledgeBaseConfig) {
        // 保持开关状态与期望状态一致
        localKnowledgeBaseToggle.checked = serverStatus.desiredState;
        localKnowledgeBaseConfig.style.display = serverStatus.desiredState ? 'block' : 'none';

        // 如果期望状态是开启，但实际状态是关闭，显示提示
        if (serverStatus.desiredState && !serverStatus.isHealthy) {
          console.log('[KnowledgeBase] Service is starting...');
        }
      }
    } catch (error) {
      console.error('[KnowledgeBase] Failed to initialize state:', error);
    }
  }

  setupEventListeners() {
    const localKnowledgeBaseToggle = document.getElementById('localKnowledgeBaseToggle');
    const remoteUploadToggle = document.getElementById('remoteUploadToggle');
    const submitLocalDirectoryBtn = document.getElementById('submitLocalDirectory');
    const selectDirectoryBtn = document.getElementById('selectDirectoryBtn');
    const saveIndexSettingsBtn = document.getElementById('saveIndexSettings');

    if (localKnowledgeBaseToggle) {
      localKnowledgeBaseToggle.addEventListener('change', () => this.toggleLocalKnowledgeBase());
    }
    if (remoteUploadToggle) {
      remoteUploadToggle.addEventListener('change', () => this.toggleRemoteUpload());
    }
    if (submitLocalDirectoryBtn) {
      submitLocalDirectoryBtn.addEventListener('click', () => this.submitLocalDirectory());
    }
    if (selectDirectoryBtn) {
      selectDirectoryBtn.addEventListener('click', async () => {
        const result = await window.electron.showDirectoryPicker();
        if (result && result.filePath) {
          document.getElementById('localDirectory').value = result.filePath;
        }
      });
    }
    if (saveIndexSettingsBtn) {
      saveIndexSettingsBtn.addEventListener('click', () => this.syncIndexSettings());
    }
  }

  // 添加新方法来设置索引设置的事件监听
  setupIndexSettingsListeners() {
    // 监听所有文件类型开关
    const simpleTypes = ['text', 'spreadsheet', 'web', 'code', 'config', 'archive'];
    simpleTypes.forEach(type => {
      const toggle = document.getElementById(`${type}FilesToggle`);
      if (toggle) {
        toggle.addEventListener('change', () => this.lockUIForUserOperation());
      }
    });

    // 监听带增强选项的文件类型
    const enhancedTypes = ['presentation', 'pdf', 'image'];
    enhancedTypes.forEach(type => {
      const typeToggle = document.getElementById(`${type}FilesToggle`);
      const enhanceToggle = document.getElementById(`${type}EnhanceToggle`);

      if (typeToggle) {
        typeToggle.addEventListener('change', () => this.lockUIForUserOperation());
      }
      if (enhanceToggle) {
        enhanceToggle.addEventListener('change', () => this.lockUIForUserOperation());
      }
    });

    // 监听忽略目录文本框
    const ignoredDirs = document.getElementById('ignoredDirectories');
    if (ignoredDirs) {
      ignoredDirs.addEventListener('input', () => this.lockUIForUserOperation());
    }
  }

  // 新增方法：锁定UI供用户操作
  lockUIForUserOperation() {
    this.isUpdatingUI = true;
    if (this.uiLockTimeout) {
      clearTimeout(this.uiLockTimeout);
    }
    // 设置30分钟的操作时间窗口
    this.uiLockTimeout = setTimeout(() => {
      this.isUpdatingUI = false;
    }, 1800000);
  }

  // 修改 syncIndexSettings 方法
  async syncIndexSettings() {
    if (!this.BASE_URL) {
      console.warn('Service not available, cannot sync settings');
      return;
    }

    try {
      const config = {
        fileTypes: {
          text: document.getElementById('textFilesToggle')?.checked || false,
          spreadsheet: document.getElementById('spreadsheetFilesToggle')?.checked || false,
          presentation: {
            enabled: document.getElementById('presentationFilesToggle')?.checked || false,
            enhanced: document.getElementById('presentationEnhanceToggle')?.checked || false
          },
          web: document.getElementById('webFilesToggle')?.checked || false,
          pdf: {
            enabled: document.getElementById('pdfFilesToggle')?.checked || false,
            enhanced: document.getElementById('pdfEnhanceToggle')?.checked || false
          },
          code: document.getElementById('codeFilesToggle')?.checked || false,
          config: document.getElementById('configFilesToggle')?.checked || false,
          image: {
            enabled: document.getElementById('imageFilesToggle')?.checked || false,
            enhanced: document.getElementById('imageEnhanceToggle')?.checked || false
          },
          archive: document.getElementById('archiveFilesToggle')?.checked || false
        },
        ignoredDirectories: document.getElementById('ignoredDirectories')?.value
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
      };

      const response = await fetch(`${this.BASE_URL}/admin/update-index-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const result = await response.json();
      if (!result.success) {
        alert(result.message || '更新配置失败');
      } else {
        alert('索引设置已保存');
        // 保存成功后解除UI锁定，允许新的操作
        this.isUpdatingUI = false;
        if (this.uiLockTimeout) {
          clearTimeout(this.uiLockTimeout);
          this.uiLockTimeout = null;
        }
      }
    } catch (error) {
      console.error('Failed to sync index settings:', error);
      alert('同步配置失败: ' + error.message);
      this.isUpdatingUI = false;
    }
  }

  // 修改 toggleLocalKnowledgeBase 方法
  async toggleLocalKnowledgeBase() {
    const configSection = document.getElementById('localKnowledgeBaseConfig');
    const toggle = document.getElementById('localKnowledgeBaseToggle');
    if (!configSection || !toggle) return;

    // 禁用开关，防止重复操作
    toggle.disabled = true;

    try {
      const enable = toggle.checked;
      configSection.style.display = enable ? 'block' : 'none';

      // 使用正确的方法名调用
      const result = await window.electron.toggleKnowledgeBase(enable);

      if (result.success) {
        // 在非调试模式下才显示提示
        if (!this.lastKnownState.debugMode) {
          alert(enable ? '本地知识库服务启动，启动需要时间，等到服务状态为在线时就可用了' : '本地知识库服务已关闭');
        }
      } else {
        toggle.checked = !enable;
        configSection.style.display = !enable ? 'block' : 'none';
        alert(result.message || '操作失败');
      }
    } catch (error) {
      toggle.checked = !toggle.checked;
      configSection.style.display = !toggle.checked ? 'block' : 'none';
      alert('操作失败: ' + error.message);
    } finally {
      toggle.disabled = false;
    }
  }

  async toggleRemoteUpload() {
    const remoteUploadToggle = document.getElementById('remoteUploadToggle');
    const configSection = document.getElementById('remoteUploadConfig');

    if (!configSection || !remoteUploadToggle) return;

    const enable = remoteUploadToggle.checked;
    configSection.style.display = enable ? 'block' : 'none';

    try {
      const response = await fetch(`${this.BASE_URL}/admin/toggle-remote-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable })
      });

      const data = await response.json();
      if (data.success) {
        if (enable) {
          await this.updateUploadConfig();
        }
      } else {
        remoteUploadToggle.checked = !enable;
        configSection.style.display = !enable ? 'block' : 'none';
        alert(data.message);
      }
    } catch (error) {
      remoteUploadToggle.checked = !enable;
      configSection.style.display = !enable ? 'block' : 'none';
      alert('操作失败: ' + error.message);
    }
  }

  async updateUploadConfig() {
    try {
      const response = await fetch(`${this.BASE_URL}/admin/get-upload-config`);
      const data = await response.json();
      if (data.success) {
        document.getElementById('uploadUrl').textContent = data.uploadUrl;
        document.getElementById('uploadDir').value = data.uploadDir || 'remoteFile';
      }
    } catch (error) {
      console.error('获取上传配置失败:', error);
    }
  }

  async submitLocalDirectory() {
    const directory = document.getElementById('localDirectory').value;
    if (!directory) {
      alert('请输入文件路径');
      return;
    }

    try {
      const response = await fetch(`${this.BASE_URL}/admin/submit/path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: directory })
      });

      const data = await response.json();
      if (data.success) {
        document.getElementById('localDirectory').value = '';
        await this.updateMonitoredDirs();
      }
      alert(data.message);
    } catch (error) {
      alert('提交失败: ' + error.message);
    }
  }

  async deleteMonitoredDir(path) {
    if (confirm('确定要删除该监控目录吗？')) {
      try {
        const response = await fetch(`${this.BASE_URL}/admin/delete/monitored-dir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });

        const data = await response.json();
        if (data.success) {
          await this.updateMonitoredDirs();
        }
        alert(data.message);
      } catch (error) {
        alert('删除失败: ' + error.message);
      }
    }
  }

  // 修改 updateMonitoredDirs 方法
  async updateMonitoredDirs() {
    if (!this.BASE_URL) {
      console.warn('Service not available, cannot update monitored dirs');
      return;
    }
    try {
      const response = await fetch(`${this.BASE_URL}/admin/list/monitored-dirs`);
      const data = await response.json();
      const tbody = document.getElementById('directoryTableBody');
      if (!tbody) return;

      tbody.innerHTML = '';
      data.forEach(dir => {
        const row = tbody.insertRow();
        row.insertCell(0).textContent = dir.path;
        row.insertCell(1).textContent = dir.fileCount;
        row.insertCell(2).textContent = dir.completedCount;
        row.insertCell(3).textContent = dir.completionRate;
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.onclick = () => this.deleteMonitoredDir(dir.path);
        row.insertCell(4).appendChild(deleteButton);
      });
    } catch (error) {
      console.warn('[KnowledgeBase] Failed to update monitored dirs:', error.message);
      // 不再记录详细错误，因为服务离线时这是预期的行为
    }
  }
}
