export default class QuickNavigationHandler {
  constructor() {
    this.switchToTab = this.switchToTab.bind(this);
  }

  // 添加切换标签页的功能
  switchToTab(tabName) {
    const tabs = document.querySelectorAll('.tab');
    const tabContents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    tabContents.forEach(content => {
      if (content.id === tabName) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  }

  async setDefaultHandler(pathPrefix) {
    try {
      await electron.setDefaultHandler(pathPrefix);
      this.setupQuickNavigation(); // 重新加载以更新显示
    } catch (error) {
      console.error('设置默认插件失败:', error);
    }
  }

  async setupQuickNavigation() {
    try {
      const pluginMap = await electron.getPluginInstanceMap();
      const container = document.getElementById('quickLinksContainer');
      if (!container) return;

      container.innerHTML = '';

      // 按分类组织数据
      const categorizedPlugins = {};
      for (const [pathPrefix, plugin] of Object.entries(pluginMap)) {
        if (!categorizedPlugins[plugin.category]) {
          categorizedPlugins[plugin.category] = [];
        }
        categorizedPlugins[plugin.category].push({
          pathPrefix,
          ...plugin
        });
      }

      // 按分类创建导航项
      for (const [category, plugins] of Object.entries(categorizedPlugins)) {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'quick-link-category';

        const categoryHeader = document.createElement('h4');
        categoryHeader.textContent = category;
        categoryDiv.appendChild(categoryHeader);

        const linksDiv = document.createElement('div');
        linksDiv.className = 'quick-link-items';

        plugins.forEach(plugin => {
          const linkItem = document.createElement('div');
          linkItem.className = 'quick-link-item';
          linkItem.dataset.path = plugin.pathPrefix;

          const textContainer = document.createElement('div');
          textContainer.className = 'quick-link-content';

          const nameSpan = document.createElement('span');
          nameSpan.className = 'quick-link-name';
          nameSpan.textContent = plugin.name;

          const descSpan = document.createElement('span');
          descSpan.className = 'quick-link-description';
          descSpan.textContent = plugin.description;

          textContainer.appendChild(nameSpan);
          textContainer.appendChild(descSpan);

          if (plugin.isDefault) {
            const defaultBadge = document.createElement('span');
            defaultBadge.className = 'default-badge';
            defaultBadge.textContent = '默认';
            textContainer.appendChild(defaultBadge);
          }

          const setDefaultBtn = document.createElement('button');
          setDefaultBtn.className = 'set-default-btn';
          setDefaultBtn.textContent = '设为默认';
          setDefaultBtn.onclick = async (e) => {
            e.stopPropagation();
            await this.setDefaultHandler(plugin.pathPrefix);
          };

          linkItem.appendChild(textContainer);
          linkItem.appendChild(setDefaultBtn);
          linksDiv.appendChild(linkItem);

          linkItem.addEventListener('click', (e) => {
            // 如果点击的不是设为默认按钮
            if (!e.target.classList.contains('set-default-btn')) {
              const pathInput = document.getElementById('pathInput');
              const userInput = document.getElementById('user-input');

              // 使用 beginPath 而不是 pathPrefix
              pathInput.value = plugin.beginPath || plugin.pathPrefix;
              this.switchToTab('interaction');
              userInput.focus();
            }
          });
        });

        categoryDiv.appendChild(linksDiv);
        container.appendChild(categoryDiv);
      }
    } catch (error) {
      console.error('Failed to load quick navigation:', error);
    }
  }
}
