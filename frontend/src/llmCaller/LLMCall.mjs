import OpenAI from "openai";

export class LLMCall {
  constructor() {
    this.currentApiKey = null;
    this.openai = null;
    this.semaphore = new Semaphore(20); // 限制并发数为 4
  }

  async init(globalContext) {
    this.globalContext = globalContext;
    await this.updateClientIfNeeded();
  }

  async updateClientIfNeeded() {
    const configHandler = this.globalContext.configHandler;
    const apiKey = await configHandler.getModelSK();
    const model = await configHandler.getModelName();
    const modelBaseURL = await configHandler.getModelBaseUrl();
    const llmConcurrency = await configHandler.getLlmConcurrency();

    // 检查并更新配置
    if (apiKey !== this.currentApiKey ||
      model !== this.currentModel ||
      modelBaseURL !== this.currentModelBaseURL ||
      llmConcurrency !== this.currentLlmConcurrency) {  // 添加并发数的检查

      this.currentApiKey = apiKey;
      this.currentModel = model;
      this.currentModelBaseURL = modelBaseURL;
      this.currentLlmConcurrency = llmConcurrency;  // 保存当前并发数

      // 更新OpenAI客户端
      this.openai = new OpenAI({
        apiKey: this.currentApiKey,
        baseURL: this.currentModelBaseURL
      });

      // 更新信号量
      this.semaphore = new Semaphore(this.currentLlmConcurrency);
    }
  }

  async callAsync(userPrompts, stream = false, onStreamChunk = null) {
    try {
      await this.semaphore.acquire(); // 获取信号量
      await this.updateClientIfNeeded();
      const messages = userPrompts.map(prompt => ({ role: prompt.role, content: prompt.content }));
      const completion = await this.openai.chat.completions.create({
        messages: messages,
        stream: stream,
        model: this.currentModel
      });

      if (stream && onStreamChunk) {
        for await (const chunk of completion) {
          onStreamChunk(chunk.choices[0].delta.content);
        }
        this.semaphore.release(); // 释放信号量
        return null;
      } else {
        const result = completion.choices.map(choice => choice.message.content);
        this.semaphore.release(); // 释放信号量
        return result;
      }
    } catch (error) {
      console.error(`错误信息：${error}`);
      console.log("请参考文档：https://help.aliyun.com/zh/model-studio/developer-reference/error-code");
      this.semaphore.release(); // 发生错误时释放信号量
      throw error;
    }
  }

  async callSync(userPrompts) {
    try {
      await this.semaphore.acquire(); // 获取信号量
      await this.updateClientIfNeeded();
      const messages = userPrompts.map(prompt => ({ role: prompt.role, content: prompt.content }));
      const completion = await this.openai.chat.completions.create({
        messages: messages,
        model: this.currentModel
      });

      const result = completion.choices.map(choice => choice.message.content);
      this.semaphore.release(); // 释放信号量
      return result;
    } catch (error) {
      console.error(`错误信息：${error}`);
      console.log("请参考文档：https://help.aliyun.com/zh/model-studio/developer-reference/error-code");
      this.semaphore.release(); // 发生错误时释放信号量
      throw error;
    }
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

export default LLMCall;
