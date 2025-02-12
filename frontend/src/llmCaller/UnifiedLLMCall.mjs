import LLMCallFactory from './LLMCallFactory.mjs';

class UnifiedLLMCall {
  constructor() {
    this.llmCall = null;
    this.globalContext = null;
    this.lastUpdateTime = 0;
    this.updateInterval = 5000; // 5秒更新一次
  }

  async init(globalContext) {
    this.globalContext = globalContext;
    await this.updateImplementation();
  }

  async checkAndUpdate() {
    const now = Date.now();
    if (now - this.lastUpdateTime >= this.updateInterval) {
      await this.updateImplementation();
      this.lastUpdateTime = now;
    }
  }

  async updateImplementation() {
    if (!this.globalContext) {
      throw new Error('Global context not initialized');
    }
    this.llmCall = await LLMCallFactory.createLLMCall(this.globalContext.configHandler);
    await this.llmCall.init(this.globalContext);
  }

  async callAsync(userPrompts, stream = false, onStreamChunk = null, onComplete = null) {
    if (!this.llmCall) {
      throw new Error('LLM implementation not initialized');
    }
    await this.checkAndUpdate();
    return await this.llmCall.callAsync(userPrompts, stream, onStreamChunk, onComplete);
  }

  async callSync(userPrompts) {
    if (!this.llmCall) {
      throw new Error('LLM implementation not initialized');
    }
    await this.checkAndUpdate();
    return await this.llmCall.callSync(userPrompts);
  }
}

export default UnifiedLLMCall;
