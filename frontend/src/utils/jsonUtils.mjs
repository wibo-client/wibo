export class JsonUtils {
  /**
   * 从响应文本中提取并解析JSON
   * @param {string} response - 包含JSON的响应文本
   * @returns {string|null} 提取出的JSON字符串，失败返回null
   */
  static extractJsonFromResponse(response) {
    try {
      if (!response || response.trim().isEmpty) return null;
      
      // 1. 首先尝试查找 markdown json 代码块
      const jsonMarker = '```json';
      const startIndex = response.indexOf(jsonMarker);
      
      if (startIndex !== -1) {
        // 移动到 json 标记后面
        const contentStart = startIndex + jsonMarker.length;
        // 查找结束标记
        const endIndex = response.indexOf('```', contentStart);
        
        if (endIndex > contentStart) {
          // 提取并清理内容
          return response.substring(contentStart, endIndex).trim();
        }
      }
      
      // 2. 如果没找到代码块，尝试直接解析 JSON 对象或数组
      const possibleJson = response.trim();
      if ((possibleJson.startsWith('{') && possibleJson.endsWith('}')) || 
          (possibleJson.startsWith('[') && possibleJson.endsWith(']'))) {
        return possibleJson;
      }
      
      // 3. 最后尝试在文本中查找第一个有效的 JSON 内容
      const objectMatch = possibleJson.match(/{[\s\S]*?}/);
      const arrayMatch = possibleJson.match(/\[[\s\S]*?\]/);
      
      if (objectMatch) return objectMatch[0].trim();
      if (arrayMatch) return arrayMatch[0].trim();
      
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
