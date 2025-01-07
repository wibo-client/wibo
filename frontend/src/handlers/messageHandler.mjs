import ConfigKeys from '../config/configKeys.mjs';

export async function handleSearchAndChat(event, message, path, requestId, selectedPlugin, globalContext) {
  const { llmCaller } = globalContext;
  const pageFetchLimit = globalContext.globalConfig[ConfigKeys.PAGE_FETCH_LIMIT] || 5;
  
  // 重写查询
  const requeryResult = await selectedPlugin.rewriteQuery(message);
  
  // 搜索结果
  let searchResults = [];
  for (const query of requeryResult) {
    const result = await selectedPlugin.search(query, path);
    searchResults = searchResults.concat(result);
    if (searchResults.length >= pageFetchLimit) {
      break;
    }
  }

  // ...现有的搜索和聊天处理逻辑...
  // ...existing code...
}

export function buildSearchResultsString(searchResults) {
  let sb = '';
  let fileNumber = 1;
  searchResults.forEach(result => {
    sb += `## index ${fileNumber++} 标题 ： [${result.title}](${result.url})\n\n`;
    sb += `${result.description}\n`;
    if (result.date) {
      sb += `${result.date}\n`;
    }
  });
  return sb;
}
