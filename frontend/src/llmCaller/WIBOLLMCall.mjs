class WIBOLLMCall {
  static API_PATH = '/api/ai';  // 添加静态类变量存储 API 路径

  constructor() {
    this.baseUrl = null;
    this.currentModel = null;
    this.semaphore = new Semaphore(20);
  }

  async init(globalContext) {
    this.globalContext = globalContext;
    await this.updateConfigIfNeeded();
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
    try {
      await this.semaphore.acquire();
      await this.updateConfigIfNeeded();

      const requestBody = {
        messages: userPrompts,
        stream: stream,
        model: this.currentModel
      };

      if (stream) {
        const response = await fetch(`${this.baseUrl}/async`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              if (onComplete) {
                onComplete();
              }
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.trim() === '') continue;

              try {
                if (line.startsWith('data:')) {
                  const jsonStr = line.slice(5).trim();
                  const data = JSON.parse(jsonStr);

                  if (data.message) {
                    if (onStreamChunk) {
                      onStreamChunk(data.message);
                    }
                    fullResponse += data.message;
                  }
                }
              } catch (e) {
                console.error('解析响应数据出错:', e);
              }
            }
          }
        } catch (error) {
          console.error('流式读取错误:', error);
          throw error;
        } finally {
          reader.releaseLock();
          this.semaphore.release();
        }

        return null;
      } else {
        const response = await fetch(`${this.baseUrl}/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        this.semaphore.release();

        if (!result.success) {
          throw new Error(result.message);
        }

        return result.data.responses;
      }
    } catch (error) {
      console.error('LLM调用错误:', error);
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
