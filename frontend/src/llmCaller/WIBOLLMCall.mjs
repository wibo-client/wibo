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
    const token = await this.authService.getToken();  // 从AuthService获取token
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

  async callAsync(userPrompts, stream = false, onStreamChunk = null, onComplete = null) {
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
      if (stream) {
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
        const firstChunk = await response.text();
        try {
          const errorResponse = JSON.parse(firstChunk);
          if (!errorResponse.success) {
            logger.error('LLM调用失败:', errorResponse.message);
            throw new Error(errorResponse.message);
          }
        } catch (e) {
          // 如果解析JSON失败，说明是正常的流式响应，继续处理
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(firstChunk));
            }
          });
          const reader = stream.getReader();
          const decoder = new TextDecoder();
          let fullResponse = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              logger.debug('读取数据:', value);
              if (done) {
                if (onComplete) {
                  onComplete();
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              logger.debug('解析数据:', lines);

              // 检查第一行是否包含错误信息
              for (const line of lines) {
                if (line.trim() === '') continue;

                // 解析事件类型
                if (line.startsWith('event:')) {
                  const eventType = line.slice(6).trim();
                  continue;
                }

                // 解析数据内容
                if (line.startsWith('data:')) {
                  try {
                    const jsonStr = line.slice(5).trim();
                    const data = JSON.parse(jsonStr);

                    // 处理不同类型的事件数据
                    if (data.conversationId) {
                      // 处理conversation事件
                      logger.debug('获得会话ID:', data.conversationId);
                    } else if (data.content) {
                      // 处理message事件
                      if (onStreamChunk) {
                        onStreamChunk(data.content);
                      }
                      fullResponse += data.content;
                    }
                  } catch (e) {
                    logger.error('解析SSE数据出错:', e);
                    continue;
                  }
                }
              }
            }
          } catch (error) {
            logger.error('流式处理错误:', error);
            throw error;
          } finally {
            reader.releaseLock();
            this.semaphore.release();
          }

          return null;
        }

      } else {
        logger.debug('非流调用 , url ' + `${this.baseUrl}/sync`);
        const response = await fetch(`${this.baseUrl}/sync`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        logger.debug('响应状态:', response.status);
        const result = await response.json();
        this.semaphore.release();

        if (!result.success) {
          logger.error('LLM调用失败:', result.message);
          throw new Error(result.message || '未知错误');
        }

        return result.data.responses;
      }
    } catch (error) {
      logger.error('LLM调用错误:', error);
      this.semaphore.release();
      throw error;
    }
  }

  async callSync(userPrompts) {
    return this.callAsync(userPrompts, false);
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
