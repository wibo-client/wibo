import OpenAILLMCall from './LLMCall.mjs';
import WIBOLLMCall from './WIBOLLMCall.mjs';

class LLMCallFactory {
  static async createLLMCall(configHandler) {
    const provider = await configHandler.getLlmProvider();

    switch (provider.toLowerCase()) {
      case 'openai':
        return new OpenAILLMCall();
      case 'wibo':
      default:
        return new WIBOLLMCall();
    }
  }
}

export default LLMCallFactory;
