import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';  // 添加uuid导入

class ChatStore {
  constructor() {
    this.store = new Store({
      name: 'chat-history'
    });
  }

  addMessage(message) {
    const messages = this.store.get('messages', []);
    const messageWithId = {
      ...message,
      // 如果消息已经有id就用现有的,否则生成新的UUID
      id: message.id || uuidv4()
    };
    messages.unshift(messageWithId);
    this.store.set('messages', messages);
    return messageWithId;  // 返回带ID的消息
  }

  getMessages(offset = 0, limit = 5) {
    const messages = this.store.get('messages', []);
    return messages.slice(offset, offset + limit);
  }

  deleteMessage(messageId) {
    const messages = this.store.get('messages', []);
    const filteredMessages = messages.filter(msg => msg.id !== messageId);
    this.store.set('messages', filteredMessages);
    return true;
  }

  clearAllMessages() {
    this.store.set('messages', []);
    return true;
  }
}

export default ChatStore;
