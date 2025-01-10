// import { PathSuggestionService } from '../../src/pathSuggestion/PathSuggestionService.mjs';
// import { expect } from 'chai';

// describe('PathSuggestionService', () => {
//   let pathSuggestionService;

//   beforeEach(() => {
//     pathSuggestionService = new PathSuggestionService();

//     // 使用正斜杠格式添加路径
//     pathSuggestionService.addPathToTree('/local/docs/api');
//     pathSuggestionService.addPathToTree('/local/docs/guide');
//     pathSuggestionService.addPathToTree('/local/docs/guide/a/b/c');
//     pathSuggestionService.addPathToTree('/local/docs/guide/a/b/d');
//     pathSuggestionService.addPathToTree('/local/docs/guide/a/b/e');
//     pathSuggestionService.addPathToTree('/local/docs/guide/a/b/f');

//     pathSuggestionService.addPathToTree('/baidu/web/programming');

//     // Windows路径也使用正斜杠格式
//     pathSuggestionService.addPathToTree('/local/C:/Users/whisper/project/wibo/.git/COMMIT_EDITMSG');
//     pathSuggestionService.addPathToTree('/local/C:/Users/whisper/project/wibo/.git/config');
//     pathSuggestionService.addPathToTree('/local/C:/Users/whisper/project/wibo/.git/description');
//     pathSuggestionService.addPathToTree('/local/C:/Users/description');
//     pathSuggestionService.addPathToTree('/local/C:/Users/whisper/project/wibo/.git/FETCH_HEAD');
//     pathSuggestionService.addPathToTree('/local/C:/Users/whisper/project/wibo/.git/HEAD');
//     pathSuggestionService.addPathToTree('/local/D:/Users/whisper');
//     pathSuggestionService.addPathToTree('/local/docs/api/v1');
//   });

//   describe('getNextLevelPath', () => {
//     it('should return all child paths when no search term is provided', () => {
//       const result = pathSuggestionService.getNextLevelPath('/local/docs', '');
//       expect(result).to.have.members(['/local/docs/api/', '/local/docs/guide/']);
//     });

//     it('should return filtered child paths when search term is provided2 ', () => {
//       const result = pathSuggestionService.getNextLevelPath('/local/docs/', 'api');
//       expect(result).to.have.members(['/local/docs/api/']);
//     });

//     it('should return filtered child paths when search term is provided2 ', () => {
//       const result = pathSuggestionService.getNextLevelPath('/local/docs', '/api');
//       expect(result).to.have.members(['/local/docs/api/']);
//     });

//     it('should return empty array for non-existent path', () => {
//       const result = pathSuggestionService.getNextLevelPath('/non/existent/path', '');
//       expect(result).to.be.an('array').that.is.empty;
//     });

//     it('should return root level paths when current path is empty', () => {
//       const result = pathSuggestionService.getNextLevelPath('', '');
//       expect(result).to.have.members(['/local/', '/baidu/']);
//     });

//     it('should return root level paths when current path is root', () => {
//       const result = pathSuggestionService.getNextLevelPath('/', '');
//       expect(result).to.have.members(['/local/', '/baidu/']);
//     });

//     it('should return git related paths when searching in .git directory', () => {
//       const result = pathSuggestionService.getNextLevelPath('/local/C:/Users/whisper/project/wibo/.git', '');
//       expect(result.map(path => path.toLowerCase())).to.have.members([
//         '/local/c:/users/whisper/project/wibo/.git/commit_editmsg/',
//         '/local/c:/users/whisper/project/wibo/.git/config/',
//         '/local/c:/users/whisper/project/wibo/.git/description/',
//         '/local/c:/users/whisper/project/wibo/.git/fetch_head/',
//         '/local/c:/users/whisper/project/wibo/.git/head/'
//       ]);
//     });

//     it('should return C:/ path when searching in /local/ directory', () => {
//       const result = pathSuggestionService.getNextLevelPath('/local/', '');
//       expect(result.map(path => path.toLowerCase())).to.have.members(['c:/', 'docs/', 'd:/']);
//     });

//     it('should return all child paths (include Windows-like) when requesting all', () => {
//       // 模拟获取所有路径
//       const result = pathSuggestionService.getNextLevelPath('/local/', '');
//       // 期望同时包含 Unix 和 Windows 风格路径
//       expect(result).to.include.members(['docs/', 'c:/', 'c:/']);
//     });

//     it('should return a title-like result 2', () => {
//       const result = pathSuggestionService.getNextLevelPath('/local/docs', 'api');
//       expect(result).to.have.members(['/local/docs/api/']);
//     });

//     it('should return a title-like result 1', () => {
//       // 当传入空路径时，可以返回标题或提示文本
//       const result = pathSuggestionService.getNextLevelPath('descrioption', '');
//       expect(result).to.have.members(['/local/C:/Users/whisper/project/wibo/.git/description', '/local/C:/Users/description']);
//     });
//   });
// });