export default class KnowledgeBaseHandler {
  constructor() {
    this.isUpdatingUI = false; // 添加UI更新锁定标志
    this.uiLockTimeout = null; // 添加UI锁定计时器
    this.setupEventListeners();
    this.setupIndexSettingsListeners(); // 添加新的方法调用
    this.setupIndexSettingsCollapsible();
  }

  init(knowledgeLocalServerStatusHandler) {
    this.knowledgeLocalServerStatusHandler = knowledgeLocalServerStatusHandler;
    this.knowledgeLocalServerStatusHandler.addStateCheckListener(state => {
      this.BASE_URL = state.baseUrl;
      this.lastKnownState = state;

      // 根据服务健康状态管理定时任务
      if (state.isHealthy) {

        this.initializeIndexSettings(); // 在构造函数中调用初始化方法
        this.updateMonitoredDirs();
        this.updateUploadConfig();
      }
    });
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


  // 添加初始化索引设置方法
  async initializeIndexSettings() {
    if (!this.BASE_URL) {
      console.warn('[本地索引服务] 服务未就绪，跳过获取索引设置');
      return;
    }
    if (this.isUpdatingUI) {
      console.log('[本地索引服务] UI正在更新中，跳过获取索引设置');
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

      console.log('[本地索引服务] 索引设置初始化完成');
    } catch (error) {
      // 只在非离线错误时打印详细信息
      if (error.name !== 'TypeError' || error.message !== 'Failed to fetch') {
        console.error('[本地索引服务] 获取索引设置失败:', error.message);
      } else {
        console.debug('[本地索引服务] 服务离线，无法获取索引设置');
      }
    }
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
      console.error('[本地索引服务] 获取上传配置失败:', error.message);
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
        body: JSON.stringify({ path: directory })  // 修改为正确的请求体格式
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
          body: JSON.stringify({ path: path })  // 修改为正确的请求体格式
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
      console.warn('[本地索引服务] 服务未就绪，无法更新监控目录');
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
        row.insertCell(2).textContent = dir.ignoredCount;
        row.insertCell(3).textContent = dir.indexedCount;
        row.insertCell(4).textContent = dir.completionRate;
        
        // 操作列添加两个按钮
        const actionsCell = row.insertCell(5);
        const deleteButton = document.createElement('button');
        const syncNowButton = document.createElement('button');
        
        deleteButton.textContent = '删除';
        syncNowButton.textContent = '立即更新';
        
        deleteButton.onclick = () => this.deleteMonitoredDir(dir.path);
        syncNowButton.onclick = () => this.syncNowMonitoredDir();
        
        // 设置按钮样式
        deleteButton.className = 'btn btn-danger btn-sm';
        syncNowButton.className = 'btn btn-primary btn-sm';
        syncNowButton.style.marginLeft = '8px';
        
        actionsCell.appendChild(deleteButton);
        actionsCell.appendChild(syncNowButton);
      });
    } catch (error) {
      console.warn('[本地索引服务] 更新监控目录失败:', error.message);
      // 不再记录详细错误，因为服务离线时这是预期的行为
    }
  }

  // 添加新方法
  setupIndexSettingsCollapsible() {
    // 移除内联的 onclick 处理器，改用事件监听
    const header = document.querySelector('.collapsible-header');
    if (header) {
      header.addEventListener('click', () => {
        const content = document.getElementById('indexSettingsContent');
        const icon = header.querySelector('.toggle-icon');
        
        if (content && icon) {
          content.classList.toggle('expanded');
          icon.classList.toggle('expanded');
        }
      });
    }
  }

  // 新增立即更新方法
  async syncNowMonitoredDir() {
    try {
      const response = await fetch(`${this.BASE_URL}/admin/sync-now`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();
      if (data.success) {
        await this.updateMonitoredDirs();
        alert('手动同步已触发');
      } else {
        alert(data.message || '同步失败');
      }
    } catch (error) {
      alert('同步失败: ' + error.message);
    }
  }
}
