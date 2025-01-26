export default class RefineryHandler {
  constructor() {
  }

  init(knowledgeLocalServerStatusHandler) {
    this.knowledgeLocalServerStatusHandler = knowledgeLocalServerStatusHandler;
    this.knowledgeLocalServerStatusHandler.addStateCheckListener(state => {
      this.BASE_URL = state.baseUrl;
      this.lastKnownState = state;
      if(state.isHealthy) {
        this.updateRefineryTasks();
      }
    });
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 这里可以添加更多的事件监听器和处理逻辑
    this.setupRefineryHandlers();
  }


  // 新增知识精炼相关事件处理
  setupRefineryHandlers() {
    // 添加新精炼任务按钮事件
    const addTaskBtn = document.querySelector('.add-refinery-task');
    if (addTaskBtn) {
      addTaskBtn.addEventListener('click', () => {
        this.showCreateTaskDialog();
      });
    }

    // 为所有精炼任务操作按钮添加事件
    document.querySelectorAll('.refinery-table .action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.classList.contains('update-full') ? 'full' :
          e.target.classList.contains('update-incremental') ? 'incremental' :
            'delete';
        const row = e.target.closest('tr');
        const directory = row.cells[0].textContent;
        const question = row.cells[1].textContent;

        console.log(`执行${action}操作:`, { directory, question });
        // TODO: 实现具体操作逻辑
      });
    });
  }

  showCreateTaskDialog() {
    const dialogHtml = `
        <div class="modal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">创建精炼任务</h5>
                    </div>
                    <div class="modal-body">
                        <form id="refineryTaskForm">
                            <div class="mb-3">
                                <label for="directoryPath" class="form-label">目录路径</label>
                                <input type="text" class="form-control modal-input" id="directoryPath" required>
                            </div>
                            <div class="mb-3">
                                <label for="keyQuestion" class="form-label">关键问题</label>
                                <input type="text" class="form-control modal-input" id="keyQuestion" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">取消</button>
                        <button type="button" class="btn btn-primary" id="submitTask">创建</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 创建对话框元素
    const dialogWrapper = document.createElement('div');
    dialogWrapper.innerHTML = dialogHtml;
    const dialog = dialogWrapper.firstElementChild;
    document.body.appendChild(dialog);

    // 显示对话框
    dialog.style.display = 'block';
    dialog.classList.add('show');

    // 关闭按钮事件
    const closeButtons = dialog.querySelectorAll('[data-dismiss="modal"]');
    closeButtons.forEach(button => {
        button.onclick = () => {
            dialog.remove();
        };
    });

    // 提交按钮事件
    const submitButton = dialog.querySelector('#submitTask');
    submitButton.onclick = async () => {
        try {
            const taskData = {
                directoryPath: dialog.querySelector('#directoryPath').value,
                keyQuestion: dialog.querySelector('#keyQuestion').value,
                updateCycle: dialog.querySelector('#updateCycle').value
            };

            // 校验必填字段
            if (!taskData.directoryPath || !taskData.keyQuestion) {
                this.showErrorMessage('请填写所有必填字段');
                return;
            }

            // 创建任务
            await this.addRefineryTask(taskData);
            
            // 关闭对话框
            dialog.remove();
            
            // 显示成功消息
            this.showSuccessMessage('任务创建成功');
            
            // 刷新任务列表
            await this.updateRefineryTasks();

        } catch (error) {
            this.showErrorMessage(error.message);
        }
    };
  }

  showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'alert alert-danger position-fixed top-0 end-0 m-3';
    toast.style.zIndex = '9999';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.className = 'alert alert-success position-fixed top-0 end-0 m-3';
    toast.style.zIndex = '9999';
    toast.innerHTML = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // 添加新的精炼任务
  async addRefineryTask(task) {
    if (!this.BASE_URL) {
      throw new Error('Local server is not available');
    }

    const response = await fetch(`${this.BASE_URL}/api/refinery/task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(task)
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '添加任务失败');
    }

    await this.updateRefineryTasks();
    return data.data;
  }

  // 更新精炼任务
  async updateRefineryTask(taskId, type) {
    if (!this.BASE_URL) {
      throw new Error('Local server is not available');
    }

    const response = await fetch(`${this.BASE_URL}/api/refinery/task/${taskId}/update-${type}`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '更新任务失败');
    }

    await this.updateRefineryTasks();
    return data.data;
  }

  // 删除精炼任务
  async deleteRefineryTask(taskId) {
    if (!this.BASE_URL) {
      throw new Error('Local server is not available');
    }
    
    const response = await fetch(`${this.BASE_URL}/api/refinery/task/${taskId}/delete`, {
      method: 'POST'
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '删除任务失败');
    }

    await this.updateRefineryTasks();
    return data.data;
  }

  async updateRefineryTasks() {
    if (!this.BASE_URL) {
      console.warn('[精炼服务] 服务未就绪，无法更新任务列表');
      return;
    }

    try {
      const response = await fetch(`${this.BASE_URL}/api/refinery/tasks`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || '获取任务列表失败');
      }

      const tbody = document.querySelector('.refinery-table tbody');
      if (!tbody) return;

      tbody.innerHTML = '';
      data.data.forEach(task => {
        const row = tbody.insertRow();
        
        // 修改列的顺序和内容
        row.insertCell(0).textContent = task.directoryPath;
        row.insertCell(1).textContent = task.keyQuestion;
        row.insertCell(2).textContent = task.coveredFileCount || 0;
        row.insertCell(3).textContent = this.formatTokenCount(task.fullUpdateTokenCost);
        row.insertCell(4).textContent = this.formatTokenCount(task.incrementalTokenCost);
        row.insertCell(5).textContent = task.hitCount || 0;
        row.insertCell(6).textContent = this.formatDateTime(task.createTime);
        row.insertCell(7).innerHTML = this.formatStatus(task.status);
        row.insertCell(8).textContent = task.errorMessage || '';
        
        // 添加操作按钮列
        const actionsCell = row.insertCell(9);
        
        // 创建操作按钮
        const updateFullBtn = document.createElement('button');
        const updateIncrBtn = document.createElement('button');
        const deleteBtn = document.createElement('button');
        
        updateFullBtn.textContent = '全量更新';
        updateIncrBtn.textContent = '增量更新';
        deleteBtn.textContent = '删除';
        
        updateFullBtn.className = 'btn btn-sm btn-primary action-btn update-full';
        updateIncrBtn.className = 'btn btn-sm btn-info action-btn update-incremental';
        deleteBtn.className = 'btn btn-sm btn-danger action-btn delete-btn';
        
        updateFullBtn.onclick = () => this.updateRefineryTask(task.id, 'full');
        updateIncrBtn.onclick = () => this.updateRefineryTask(task.id, 'incremental');
        deleteBtn.onclick = () => this.confirmAndDeleteTask(task.id);
        
        actionsCell.appendChild(updateFullBtn);
        actionsCell.appendChild(updateIncrBtn);
        actionsCell.appendChild(deleteBtn);
      });
    } catch (error) {
      console.warn('[精炼服务] 更新任务列表失败:', error.message);
      this.showErrorMessage('更新任务列表失败: ' + error.message);
    }
  }

  // 新增格式化方法
  formatTokenCount(count) {
    if (!count) return '0';
    return count > 1000 ? (count/1000).toFixed(1) + 'k' : count;
  }

  formatUpdateCycle(cycle) {
    const cycleMap = {
      'DAILY': '每日',
      'WEEKLY': '每周',
      'MONTHLY': '每月'
    };
    return cycleMap[cycle] || cycle;
  }

  formatStatus(status) {
    const statusMap = {
      'ACTIVE': '<span class="status-badge status-active">活跃</span>',
      'PROCESSING': '<span class="status-badge status-processing">处理中</span>',
      'FAILED': '<span class="status-badge status-failed">失败</span>',
      'PENDING': '<span class="status-badge status-pending">待处理</span>'
    };
    return statusMap[status] || status;
  }

  async confirmAndDeleteTask(taskId) {
    if (confirm('确定要删除这个任务吗？')) {
      try {
        await this.deleteRefineryTask(taskId);
        this.showSuccessMessage('任务删除成功');
      } catch (error) {
        this.showErrorMessage(error.message);
      }
    }
  }

  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return '';
    try {
        const date = new Date(dateTimeStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateTimeStr;
    }
  }
}
