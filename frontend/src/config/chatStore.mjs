import Store from 'electron-store';
import { v4 as uuidv4 } from 'uuid';  // 添加uuid导入

class ChatStore {
  constructor() {
    this.store = new Store({
      name: 'chat-history'
    });
  }

addMessage(message) {
    let messages = this.store.get('messages', []);
    const MAX_MESSAGES = 200;
    
    // 如果消息数量超过限制，删除最早的消息
    if (messages.length >= MAX_MESSAGES) {
        messages = messages.slice(messages.length - MAX_MESSAGES + 1);
    }
    
    const messageWithId = {
        ...message,
        id: message.id || uuidv4()
    };
    
    messages.push(messageWithId);
    this.store.set('messages', messages);
    return messageWithId;
}

  getMessages(offset = 0, limit = 5) {
    const messages = this.store.get('messages', []);
    const reversedMessages = messages.slice().reverse();  // 先反转一次
    const slicedMessages = reversedMessages.slice(offset, offset + limit); // 截取需要的部分
    return slicedMessages.slice().reverse(); // 再反转回来
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
