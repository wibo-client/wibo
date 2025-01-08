import OpenAI from "openai";

export class LLMCall {
  constructor() {
    this.currentApiKey = null;
    this.openai = null;
  }

  async init(globalContext) {
    this.globalContext = globalContext;
    await this.updateClientIfNeeded();
  }

  async updateClientIfNeeded() {
    const configHandler = this.globalContext.configHandler;
    const globalConfig = await configHandler.getGlobalConfig();
    const apiKey = globalConfig.modelSK;

    if (apiKey !== this.currentApiKey) {
      this.currentApiKey = apiKey;
      this.openai = new OpenAI({
        apiKey: this.currentApiKey,
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
      });
    }
  }

  async callAsync(userPrompts, stream = false, onStreamChunk = null) {
    try {
      await this.updateClientIfNeeded();
      const messages = userPrompts.map(prompt => ({ role: prompt.role, content: prompt.content }));
      const completion = await this.openai.chat.completions.create({
        model: "qwen-plus",
        messages: messages,
        stream: stream
      });

      if (stream && onStreamChunk) {
        for await (const chunk of completion) {
          onStreamChunk(chunk.choices[0].delta.content);
        }
        return null;
      } else {
        return completion.choices.map(choice => choice.message.content);
      }
    } catch (error) {
      console.error(`错误信息：${error}`);
      console.log("请参考文档：https://help.aliyun.com/zh/model-studio/developer-reference/error-code");
      throw error;
    }
  }

  async callSync(userPrompts) {
    try {
      await this.updateClientIfNeeded();
      const messages = userPrompts.map(prompt => ({ role: prompt.role, content: prompt.content }));
      const completion = this.openai.chat.completions.create({
        model: "qwen-plus",
        messages: messages
      });

      return completion.choices.map(choice => choice.message.content);
    } catch (error) {
      console.error(`错误信息：${error}`);
      console.log("请参考文档：https://help.aliyun.com/zh/model-studio/developer-reference/error-code");
      throw error;
    }
  }
}

export default LLMCall;
