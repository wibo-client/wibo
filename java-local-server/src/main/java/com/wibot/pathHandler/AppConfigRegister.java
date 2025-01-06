// package com.wibot.pathHandler;

// import org.springframework.context.annotation.Bean;
// import org.springframework.context.annotation.Configuration;
// import org.springframework.context.annotation.Scope;

// import com.wibot.index.DocumentIndexInterface;
// import com.wibot.index.NodeSearchIndexImpl;
// import com.wibot.index.YuqueBasedIndex;

// @Configuration
// public class AppConfigRegister {

// @Bean
// @Scope("prototype")
// public DocumentIndexInterface
// configurableYuqueBasedIndexHandler(HandlerConfig config) {
// return new YuqueBasedIndex(config);
// }

// @Bean
// @Scope("prototype")
// public DocumentIndexInterface configurableNodeBasedIndexHandler(HandlerConfig
// config) {
// return new NodeSearchIndexImpl(config);
// }

// }
