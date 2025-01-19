export class JsonUtils {
  /**
   * 从响应文本中提取并解析JSON
   * @param {string} response - 包含JSON的响应文本
   * @returns {string|null} 提取出的JSON字符串，失败返回null
   */
  static extractJsonFromResponse(response) {
    try {
      if (!response) return null;
      
      // 如果包含 Markdown JSON 代码块
      if (response.includes('```json')) {
        const matches = response.match(/```json\n([\s\S]*?)\n```/);
        if (matches && matches[1]) {
          return matches[1].trim();
        }
      }
      
      // 尝试找到第一个有效的 JSON (对象或数组)
      const possibleJson = response.trim();
      if ((possibleJson.startsWith('{') && possibleJson.endsWith('}')) || 
          (possibleJson.startsWith('[') && possibleJson.endsWith(']'))) {
        return possibleJson;
      }
      
      // 尝试在文本中查找 JSON 格式的内容
      const objectMatches = possibleJson.match(/({[\s\S]*?})/);
      const arrayMatches = possibleJson.match(/(\[[\s\S]*?\])/);
      
      if (arrayMatches && arrayMatches[1]) {
        return arrayMatches[1].trim();
      }
      if (objectMatches && objectMatches[1]) {
        return objectMatches[1].trim();
      }
      
      return null;
    } catch (error) {
      console.error('JSON提取失败:', error);
      return null;
    }
  }

  /**
   * 验证JSON字符串是否有效
   * @param {string} jsonString - JSON字符串
   * @returns {boolean} 是否为有效的JSON
   */
  static isValidJson(jsonString) {
    try {
      const result = JSON.parse(jsonString);
      return result !== null && (typeof result === 'object' || Array.isArray(result));
    } catch (e) {
      return false;
    }
  }
}
