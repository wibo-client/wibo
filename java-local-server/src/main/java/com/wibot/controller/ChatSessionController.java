package com.wibot.controller;

import java.util.ArrayList;
import java.util.List;

import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.MediaType;

import com.wibot.service.SingletonLLMChat;
import reactor.core.publisher.Flux;

@RestController
public class ChatSessionController {
    @Autowired
    private SingletonLLMChat singletonLLMChat;

    @PostMapping(value = "/chat/streamCall", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> streamCall(@RequestBody ChatRequest request) {
        List<Message> messages = new ArrayList<>();
        
        for (ChatMessage msg : request.getMessages()) {
            switch (msg.getRole()) {
                case "user":
                    messages.add(new UserMessage(msg.getContent()));
                    break;
                case "system":
                    messages.add(new SystemMessage(msg.getContent()));
                    break;
                case "assistant":
                    messages.add(new AssistantMessage(msg.getContent()));
                    break;
            }
        }
   
        Prompt prompt = new Prompt(messages);

        return singletonLLMChat.getChatClient()
                .prompt(prompt)
                .stream()
                .content();
    }

    // 添加同步调用端点
    @PostMapping("/chat/syncCall")
    public String syncCall(@RequestBody ChatRequest request) {
        List<Message> messages = new ArrayList<>();
        
        for (ChatMessage msg : request.getMessages()) {
            switch (msg.getRole()) {
                case "user":
                    messages.add(new UserMessage(msg.getContent()));
                    break;
                case "system":
                    messages.add(new SystemMessage(msg.getContent()));
                    break;
                case "assistant":
                    messages.add(new AssistantMessage(msg.getContent()));
                    break;
            }
        }
   
        Prompt prompt = new Prompt(messages);
        return singletonLLMChat.getChatClient()
                .prompt(prompt)
                .call()
                .content();
    }
}

class ChatMessage {
    private String role;
    private String content;

    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}

class ChatRequest {
    private ChatMessage[] messages;

    public ChatMessage[] getMessages() { return messages; }
    public void setMessages(ChatMessage[] messages) { this.messages = messages; }
}
