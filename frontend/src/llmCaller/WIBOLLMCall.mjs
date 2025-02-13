import logger from '../utils/loggerUtils.mjs';
import Store from 'electron-store';

class WIBOLLMCall {
  static API_PATH = '/api/ai';

  constructor() {
    this.baseUrl = null;
    this.currentModel = null;
    this.semaphore = new Semaphore(20);
    this.authService = null;  // 添加authService引用
    this.conversationStore = new Store({
      name: 'conversation-id-store', // 指定store文件名
      defaults: {
        conversationId: null
      }
    });
  }

  async init(globalContext) {
    this.globalContext = globalContext;
    this.authService = this.globalContext.authService;  // 获取AuthService实例
    await this.updateConfigIfNeeded();
  }

  // 获取认证头部
  async getAuthHeaders() {
    const token = await this.authService.getAccessToken();  // 从AuthService获取token
    return token ? {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    } : {
      'Content-Type': 'application/json'
    };
  }

  async updateConfigIfNeeded() {
    const configHandler = this.globalContext.configHandler;
    const model = await configHandler.getModelName();
    const llmConcurrency = await configHandler.getLlmConcurrency();
    const baseUrl = await configHandler.getWiboServiceUrl();
    const serviceUrl = `${baseUrl}${WIBOLLMCall.API_PATH}`;  // 使用类变量拼接完整URL

    if (model !== this.currentModel ||
      llmConcurrency !== this.currentLlmConcurrency ||
      serviceUrl !== this.baseUrl) {

      this.currentModel = model;
      this.currentLlmConcurrency = llmConcurrency;
      this.baseUrl = serviceUrl;
      this.semaphore = new Semaphore(this.currentLlmConcurrency);
    }
  }

  // 获取当前会话ID
  getCurrentConversationId() {
    return this.conversationStore.get('conversationId');
  }

  // 设置当前会话ID
  setCurrentConversationId(id) {
    this.conversationStore.set('conversationId', id);
  }

  async processSSEData(event, data, onStreamChunk) {
    logger.debug('SSE数据:', event, data);
    try {
      switch (event) {
        case 'conversation':
          const convData = JSON.parse(data);
          const conversationId = convData.conversationId;
          // 使用Store存储conversationId
          this.setCurrentConversationId(conversationId);
          logger.info('conversation id ' + conversationId);
          break;
        case 'message':
          const messageData = JSON.parse(data);
          if (messageData.content && onStreamChunk) {
            onStreamChunk(messageData.content);
          } else {
            throw new Error('无效的message数据:', data);
          }
          break;
        case 'error':
          const jsonData = JSON.parse(data);
          if (jsonData.success === false) {
            const message = jsonData.message;
            logger.error('LLM调用错误:', message);
            throw new Error(message); // 修改这里，直接抛出原始错误信息
          } else {
            logger.error('LLM调用错误:', data);
            throw new Error(data); // 修改这里，确保错误被抛出
          }

        default:
          logger.warn('未知的SSE事件:', event);
      }
    } catch (error) {
      logger.error('处理SSE数据失败:', error);
      throw error; // 确保错误被向上传递
    }
  }

  async callAsync(userPrompts, stream = true, onStreamChunk = null, onComplete = null) {
    logger.debug('调用WIBO LLM:', userPrompts);
    try {
      await this.semaphore.acquire();
      logger.debug('获取信号量');
      await this.updateConfigIfNeeded();
      logger.debug('更新配置');

      const headers = await this.getAuthHeaders();
      const currentUser = await this.authService.getCurrentUser(); // 获取当前登录用户

      const requestBody = {
        messages: userPrompts,
        stream: stream,
        model: this.currentModel,
        userId: currentUser ? currentUser.id : null, // 添加userId
        conversationId: this.getCurrentConversationId() // 从Store获取conversationId
      };

      logger.debug('请求数据:', requestBody);

      logger.debug('流式调用 , url ' + `${this.baseUrl}/async`);
      const response = await fetch(`${this.baseUrl}/async`, {
        method: 'POST',
        headers: {
          ...headers,
          'Accept': 'text/event-stream'
        },
        body: JSON.stringify(requestBody)
      });

      logger.debug('响应状态:', response.status);
      // 首先尝试解析响应的第一行，检查是否有错误信息
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';
      let currentEvent = '';
      let currentData = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        let lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 确保保留最后一个不完整的行

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '') continue; // 忽略空行

          if (trimmedLine.startsWith('event:')) {
            currentEvent = trimmedLine.slice(6).trim();
          } else if (trimmedLine.startsWith('data:')) {
            currentData = trimmedLine.slice(5).trim();
            try {
              await this.processSSEData(currentEvent, currentData, onStreamChunk);
            } catch (error) {

              throw error; // 继续向上传递错误
            }
          } else {
            logger.warn('未知的SSE行:', trimmedLine);
          }
        }
      }

      if (onComplete) {
        onComplete(fullResponse);
      }

      this.semaphore.release();
    } catch (error) {
      logger.error('LLM调用错误:', error);

      this.semaphore.release();
      throw error;
    }
  }

  isJSON(str) {
    str = str.trim();
    return str.startsWith('{') && str.endsWith('}') ||
      str.startsWith('[') && str.endsWith(']');
  }

}

class Semaphore {
  constructor(maxConcurrent) {
    this.maxConcurrent = maxConcurrent;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.current < this.maxConcurrent) {
      this.current++;
      return;
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      const resolve = this.queue.shift();
      resolve();
      this.current++;
    }
  }

}

export default WIBOLLMCall;
