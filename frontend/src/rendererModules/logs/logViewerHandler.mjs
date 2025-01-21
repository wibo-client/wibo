export default class LogViewerHandler {
  constructor() {
    this.viewLogsButton = document.getElementById('viewLogsButton');
    this.logDialog = document.getElementById('logDialog');
    this.logOverlay = document.getElementById('logOverlay');
    this.closeButton = document.querySelector('.log-dialog .close-button');
    this.logContent = document.getElementById('logContent');
    this.isLogViewerActive = false;
    this.currentOffset = 0;
    this.isLoading = false;
    this.totalLines = 0;
    this.updateInterval = null;
    this.logPathDisplay = document.getElementById('logPathDisplay');

    this.init();
  }

  init() {
    this.viewLogsButton.addEventListener('click', () => this.openLogDialog());
    this.closeButton.addEventListener('click', () => this.closeLogDialog());
    this.logOverlay.addEventListener('click', () => this.closeLogDialog());

    this.logDialog.addEventListener('click', (e) => e.stopPropagation());

    // 添加滚动事件监听
    this.logContent.addEventListener('scroll', () => this.handleScroll());

    // ESC键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isLogViewerActive) {
        this.closeLogDialog();
      }
    });
  }

  async openLogDialog() {
    if (this.isLogViewerActive) return;

    try {
      this.isLogViewerActive = true;
      this.currentOffset = 0;
      this.logDialog.classList.add('active');
      this.logOverlay.classList.add('active');

      const result = await window.electron.logs.getLogs(this.currentOffset);
      // 更新显示完整的日志文件信息
      this.logPathDisplay.textContent = `当前日志: ${result.logFile.filename} (${result.logFile.fullPath})`;

      this.totalLines = result.total;
      this.appendLogs(result.lines, true);
      this.startAutoUpdate();

      this.logContent.setAttribute('readonly', 'true');
      this.logContent.style.userSelect = 'text';
      this.logContent.style.webkitUserSelect = 'text';
    } catch (error) {
      console.error('获取日志失败:', error);
      this.logContent.textContent = '获取日志失败: ' + error.message;
    }
  }

  closeLogDialog() {
    if (!this.isLogViewerActive) return;

    this.stopAutoUpdate();
    this.logDialog.classList.remove('active');
    this.logOverlay.classList.remove('active');
    this.isLogViewerActive = false;
    this.logContent.textContent = '';
    this.currentOffset = 0;
    this.totalLines = 0;
  }

  async loadInitialLogs() {
    const result = await window.electron.logs.getLogs(this.currentOffset);
    this.totalLines = result.total;
    this.appendLogs(result.lines, true);
  }

  async handleScroll() {
    if (this.isLoading) return;

    const { scrollTop } = this.logContent;
    // 当滚动到顶部时加载更早的日志
    if (scrollTop === 0) {
      this.isLoading = true;
      this.currentOffset += 500;

      const result = await window.electron.logs.getLogs(this.currentOffset);
      if (result.lines.length > 0) {
        const originalHeight = this.logContent.scrollHeight;

        // 在顶部插入早期日志
        const fragment = document.createDocumentFragment();
        result.lines.forEach(line => {
          const div = document.createElement('div');
          div.textContent = line;
          fragment.appendChild(div);
        });
        this.logContent.insertBefore(fragment, this.logContent.firstChild);

        // 保持滚动位置
        this.logContent.scrollTop = this.logContent.scrollHeight - originalHeight;
      }
      this.isLoading = false;
    }
  }

  appendLogs(lines, clear = false) {
    if (clear) {
      this.logContent.textContent = '';
    }

    const fragment = document.createDocumentFragment();
    lines.forEach(line => {
      const div = document.createElement('div');
      div.textContent = line;
      fragment.appendChild(div);
    });

    // 总是追加到末尾
    this.logContent.appendChild(fragment);

    // 如果是初始加载或者用户在底部，滚动到最新内容
    if (clear || this.isUserAtBottom()) {
      this.scrollToBottom();
    }
  }

  isUserAtBottom() {
    const { scrollTop, scrollHeight, clientHeight } = this.logContent;
    return scrollHeight - scrollTop - clientHeight < 100;
  }

  scrollToBottom() {
    this.logContent.scrollTop = this.logContent.scrollHeight;
  }

  startAutoUpdate() {
    this.updateInterval = setInterval(async () => {
      if (this.isLogViewerActive && !this.isLoading) {
        const result = await window.electron.logs.getLatestLogs(this.totalLines);
        if (result.newLines.length > 0) {
          this.totalLines = result.total;
          // 更新日志文件信息，以防日期发生变化
          this.logPathDisplay.textContent = `当前日志: ${result.logFile.filename} (${result.logFile.fullPath})`;
          this.appendLogs(result.newLines);

          // 如果用户在底部，自动滚动到新内容
          const { scrollTop, scrollHeight, clientHeight } = this.logContent;
          if (scrollHeight - scrollTop - clientHeight < 100) {
            this.logContent.scrollTop = this.logContent.scrollHeight;
          }
        }
      }
    }, 1000);
  }

  stopAutoUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }
}
