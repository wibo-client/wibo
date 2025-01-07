import ConfigKeys from '../../config/configKeys.mjs';

export default class KnowledgeBaseHandler {
  constructor() {
    this.BASE_URL = null;
    this.updateTimer = null;  // 添加定时器引用
    this.setupEventListeners();
    
    // 不再直接启动定时更新，而是通过状态检查来控制
    this.setupPortCheck();
  }

  // 添加定时器控制方法
  startUpdateTimer() {
    if (!this.updateTimer) {
      this.updateMonitoredDirs(); // 立即执行一次
      this.updateTimer = setInterval(() => this.updateMonitoredDirs(), 10000);
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

  // 添加端口检查和BASE_URL更新方法
  async setupPortCheck() {
    const updateBaseUrl = async () => {
      try {
        const serverStatus = await window.electron.getServerDesiredState();
        if (serverStatus.isHealthy && serverStatus.port) {
          this.BASE_URL = `http://localhost:${serverStatus.port}`;
          this.startUpdateTimer(); // 服务在线时启动定时器
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

  async componentDidMount() {
    // 获取初始状态
    const serverStatus = await window.electron.getServerDesiredState();
    const localKnowledgeBaseToggle = document.getElementById('localKnowledgeBaseToggle');
    const localKnowledgeBaseConfig = document.getElementById('localKnowledgeBaseConfig');
    
    if (localKnowledgeBaseToggle && localKnowledgeBaseConfig) {
      localKnowledgeBaseToggle.checked = serverStatus.desiredState;
      localKnowledgeBaseConfig.style.display = serverStatus.desiredState ? 'block' : 'none';
    }

    // 更新状态信息
    if (serverStatus.isHealthy) {
      this.BASE_URL = `http://localhost:${serverStatus.port}`;
    }
  }

  setupEventListeners() {
    const localKnowledgeBaseToggle = document.getElementById('localKnowledgeBaseToggle');
    const remoteUploadToggle = document.getElementById('remoteUploadToggle');
    const submitLocalDirectoryBtn = document.getElementById('submitLocalDirectory');
    const preRecognizeImagesToggle = document.getElementById('preRecognizeImages');
    const preRecognizePDFsToggle = document.getElementById('preRecognizePDFs');
    const preRecognizePPTsToggle = document.getElementById('preRecognizePPTs');
    const selectDirectoryBtn = document.getElementById('selectDirectoryBtn');

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

    // 设置模型增强开关的事件监听
    const handleModelEnhancement = () => {
      const config = {
        enableImageRecognition: preRecognizeImagesToggle?.checked || false,
        enablePdfRecognition: preRecognizePDFsToggle?.checked || false,
        enablePptRecognition: preRecognizePPTsToggle?.checked || false
      };

      fetch(`${this.BASE_URL}/admin/toggle-model-enhancement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      })
      .then(response => response.json())
      .then(data => {
        if (!data.success) {
          alert(data.message);
        }
      })
      .catch(error => {
        alert('操作失败: ' + error.message);
      });
    };

    if (preRecognizeImagesToggle) {
      preRecognizeImagesToggle.addEventListener('change', handleModelEnhancement);
    }
    if (preRecognizePDFsToggle) {
      preRecognizePDFsToggle.addEventListener('change', handleModelEnhancement);
    }
    if (preRecognizePPTsToggle) {
      preRecognizePPTsToggle.addEventListener('change', handleModelEnhancement);
    }
  }

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
        alert(enable ? '本地知识库服务启动，启动需要时间，等到服务状态为在线时就可用了' : '本地知识库服务已关闭');
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

  async updateMonitoredDirs() {
    if (!this.BASE_URL) {
      console.log('[KnowledgeBase] Skipping update - service not available');
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
