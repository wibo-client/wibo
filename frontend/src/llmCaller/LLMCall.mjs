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
    const apiKey = await configHandler.getModelSK();
    const model = await configHandler.getModelName();
    const modelBaseURL = await configHandler.getModelBaseUrl();

    if (apiKey !== this.currentApiKey || model !== this.currentModel || modelBaseURL !== this.currentModelBaseURL) {
      this.currentApiKey = apiKey;
      this.currentModel = model;
      this.currentModelBaseURL = modelBaseURL;
      this.openai = new OpenAI({
        apiKey: this.currentApiKey,
        baseURL: this.currentModelBaseURL
      });
    }
  }

  async callAsync(userPrompts, stream = false, onStreamChunk = null) {
    try {
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
        messages: messages,
        model: this.currentModel
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
