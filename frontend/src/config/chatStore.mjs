import Store from 'electron-store';

export default class ChatStore {
  constructor() {
    this.store = new Store({
      name: 'chat-history',
      defaults: {
        messages: []
      }
    });
  }

  addMessage(message) {
    let messages = this.store.get('messages');
    messages.push(message);
    
    // 保持最近300条记录
    if (messages.length > 300) {
      messages = messages.slice(-300);
    }
    
    this.store.set('messages', messages);
  }

  getMessages(offset = 0, limit = 5) {
    const messages = this.store.get('messages');
    return messages.slice(Math.max(0, messages.length - offset - limit), messages.length - offset);
  }

  getTotalCount() {
    return this.store.get('messages').length;
  }
}
