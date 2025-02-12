import logger from '../utils/loggerUtils.mjs';

class WIBOLLMCall {
  static API_PATH = '/api/ai';

  constructor() {
    this.baseUrl = null;
    this.currentModel = null;
    this.semaphore = new Semaphore(20);
    this.authService = null;  // 添加authService引用
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

  async callAsync(userPrompts, stream = true, onStreamChunk = null, onComplete = null) {
    logger.debug('调用WIBO LLM:', userPrompts);
    try {
      await this.semaphore.acquire();
      logger.debug('获取信号量');
      await this.updateConfigIfNeeded();
      logger.debug('更新配置');

      const headers = await this.getAuthHeaders();
      const requestBody = {
        messages: userPrompts,
        stream: stream,
        model: this.currentModel
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { steam: false });
        if (this.isJSON(chunk)) {
          //这一般是返回了错误等，解析错误
          const jsonData = JSON.parse(chunk);

          logger.debug('json 数据', jsonData);
          if (jsonData.success === false) {
            const message = jsonData.message;
            throw new Error(message);
          }
        }
        buffer += chunk;

        // 按行处理数据
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留最后一个不完整的行

        let currentEvent = '';
        let currentData = '';

        for (const aline of lines) {
          const line = aline.trim();
          if (line.startsWith('event:')) {
            currentEvent = line.slice(6);
          } else if (line.startsWith('data:')) {
            currentData = line.slice(5);
            if (line && currentEvent)
              logger.debug('SSE数据:', currentEvent, currentData);
            switch (currentEvent) {
              case 'conversation':
                const convData = JSON.parse(currentData);
                const conversationId = convData.conversationId;
                logger.info('conversation id ' + conversationId);
                break;
              case 'message':
                const messageData = JSON.parse(currentData);
                if (messageData.content && onStreamChunk) {
                  onStreamChunk(messageData.content);
                  fullResponse += messageData.content;
                }
                break;
              case '':
                continue;
              default:
                throw new Error('未知的SSE事件:' + currentEvent);
            }

          }
        }
      }
      // 处理最后可能的残留数据
      if (buffer) {
        try {
          const jsonData = JSON.parse(buffer.slice(5));
          if (jsonData.content && onStreamChunk) {
            onStreamChunk(jsonData.content);
            fullResponse += jsonData.content;
          }
        } catch (e) {
          logger.warn('解析最终SSE数据失败:', e);
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
