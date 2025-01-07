import PluginHandlerImpl from './indexHandler/pluginHandlerImpl.mjs';
import LLMCall from './llmCaller/LLMCall.mjs';
import FileHandler from './file/fileHandler.mjs';
import ConfigHandler from './config/configHandler.mjs';
import ContentAggregator from './contentHandler/contentAggregator.mjs';
import LLMBasedRerankImpl from './rerank/llmbasedRerankImpl.mjs';
import LLMBasedQueryRewriter from './requery/llmBasedRewriteQueryImpl.mjs';
import LocalServerManager from './server/LocalServerManager.mjs';
import ConfigKeys from './config/configKeys.mjs';

export async function initializeGlobalContext() {
  const configHandler = new ConfigHandler();
  const pluginHandler = new PluginHandlerImpl();
  const fileHandler = new FileHandler();
  const contentAggregator = new ContentAggregator();
  const rerankImpl = new LLMBasedRerankImpl();
  const rewriteQueryer = new LLMBasedQueryRewriter();
  const localServerManager = new LocalServerManager();
  const llmCaller = new LLMCall();

  const globalConfig = await configHandler.getGlobalConfig();

  const globalContext = {
    pluginHandler,
    llmCaller,
    globalConfig,
    fileHandler,
    configHandler,
    contentAggregator,
    rerankImpl,
    rewriteQueryer,
    localServerManager
  };

  let modelSK = globalConfig[ConfigKeys.MODEL_SK];
  if (modelSK) {
    console.log(`Using model SK: ${modelSK}`);
    await llmCaller.init(modelSK);
  } else {
    console.log(`No model SK is set`);
  }

  await rewriteQueryer.init(llmCaller);
  await rerankImpl.init(globalContext);
  await contentAggregator.init(globalContext);
  await pluginHandler.init(globalContext);

  return globalContext;
}
