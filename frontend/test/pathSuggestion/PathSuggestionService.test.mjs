import { PathSuggestionService } from '../../src/pathSuggestion/PathSuggestionService.mjs';
import { expect } from 'chai';

describe('PathSuggestionService', () => {
  let pathSuggestionService;

  beforeEach(() => {
    // 确保在每个测试用例前初始化实例
    pathSuggestionService = new PathSuggestionService();

    // 构建测试用的路径树
    pathSuggestionService.addPathToTree('/local/docs/api');
    pathSuggestionService.addPathToTree('/local/docs/guide');
    pathSuggestionService.addPathToTree('/baidu/web/programming');

    // 添加 Git 相关路径，使用原始的反斜杠格式
    pathSuggestionService.addPathToTree('/local/C:\\Users\\whisper\\project\\wibo\\.git\\COMMIT_EDITMSG');
    pathSuggestionService.addPathToTree('/local/C:\\Users\\whisper\\project\\wibo\\.git\\config');
    pathSuggestionService.addPathToTree('/local/C:\\Users\\whisper\\project\\wibo\\.git\\description');
    pathSuggestionService.addPathToTree('/local/C:\\Users\\whisper\\project\\wibo\\.git\\FETCH_HEAD');
    pathSuggestionService.addPathToTree('/local/C:\\Users\\whisper\\project\\wibo\\.git\\HEAD');
    pathSuggestionService.addPathToTree('/local/D:\\Users\\whisper');
  });

  1) 要返回全部
2）c: \ 要支持
3）如果下一级目录只有一个，就继续读取下一个
4）如果path是空的，就返回 title like

describe('getNextLevelPath', () => {
  it('should return all child paths when no search term is provided', () => {
    const result = pathSuggestionService.getNextLevelPath('/local/docs', '');
    expect(result).to.have.members(['/local/docs/api/', '/local/docs/guide/']);
  });

  it('should return filtered child paths when search term is provided', () => {
    const result = pathSuggestionService.getNextLevelPath('/local/docs', 'api');
    expect(result).to.have.members(['/local/docs/api/']);
  });

  it('should return empty array for non-existent path', () => {
    const result = pathSuggestionService.getNextLevelPath('/non/existent/path', '');
    expect(result).to.be.an('array').that.is.empty;
  });

  it('should return root level paths when current path is empty', () => {
    const result = pathSuggestionService.getNextLevelPath('', '');
    expect(result).to.have.members(['/local/', '/baidu/']);
  });

  it('should return root level paths when current path is root', () => {
    const result = pathSuggestionService.getNextLevelPath('/', '');
    expect(result).to.have.members(['/local/', '/baidu/']);
  });

  it('should return git related paths when searching in .git directory', () => {
    const result = pathSuggestionService.getNextLevelPath('/local/C:\\Users\\whisper\\project\\wibo\\.git', '');
    expect(result).to.have.members(['\\COMMIT_EDITMSG\\', '\\config\\', '\\description\\', '\\FETCH_HEAD\\', '\\HEAD\\']);
  });

  it('should return C:\\ path when searching in /local/ directory', () => {
    const result = pathSuggestionService.getNextLevelPath('/local/', '');
    expect(result).to.have.members(['C:\\', 'docs/', 'd:\\']);
  });

});
});
