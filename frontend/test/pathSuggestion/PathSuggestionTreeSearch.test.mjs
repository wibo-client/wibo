import { PathSuggestionService } from '../../src/pathSuggestion/PathSuggestionService.mjs';
import { expect } from 'chai';

describe('PathSuggestionService TreeSearch Tests', () => {
  let service;

  beforeEach(() => {
    service = new PathSuggestionService();

    // 测试场景1和2的路径
    service.addPathToTree('/usr/local/abc');
    service.addPathToTree('/usr/local/edf');
    service.addPathToTree('/usr/search/local/abc');

    service.addPathToTree('/local/C:\\Program Files\\test');
    service.addPathToTree('/local/D:\\workspace\\project');
    service.addPathToTree('/local/usr/dev/test');

    // 测试场景4的单一路径链
    service.addPathToTree('/chain/level1/level2/level3/end1');
    service.addPathToTree('/chain/level1/level2/level3/end2');
  });

  // describe('Path Matching Tests', () => {
  //   it('should find all paths containing the search term regardless of position', () => {
  //     const result = service.getNextLevelPath('', 'local');
  //     expect(result).to.have.members([
  //       '/usr/local/abc',
  //       '/usr/local/edf',
  //       '/usr/search/local/abc'
  //     ]);
  //   });

  it('should return full chain until branch point or end', () => {
    const result = service.getNextLevelPath('/chain', '');
    expect(result).to.have.members([
      '/chain/level1/level2/level3/end1/',
      '/chain/level1/level2/level3/end2/',
    ]);
  });

  it('should only return next level directories when searching from a specific point', () => {
    const result = service.getNextLevelPath('/usr', '');
    expect(result).to.have.members(['/usr/local/', '/usr/search/']);
  });

  it('should handle Windows-style paths with proper conversion', () => {
    const result = service.getNextLevelPath('/local', '');
    expect(result).to.have.members([
      '/local/C:/',
      '/local/D:/',
      '/local/usr/'
    ]);
  });

  it('should show multiple endings when reaching a branch point', () => {
    const result = service.getNextLevelPath('/chain/level1/level2/level3/', '');
    expect(result).to.have.members([
      '/chain/level1/level2/level3/end1/',
      '/chain/level1/level2/level3/end2/',
    ]);
  });
});
});
