package com.wibot;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;
import sun.misc.Signal;
import sun.misc.SignalHandler;

public class SignalHandlerImpl implements SignalHandler {
    private static final Logger logger = LoggerFactory.getLogger(SignalHandlerImpl.class);
    private final ApplicationContext context;

    public SignalHandlerImpl(ApplicationContext context) {
        this.context = context;
    }

    @Override
    public void handle(Signal signal) {
        logger.info("收到系统信号: {}", signal.getName());
        
        switch (signal.getName()) {
            case "TERM":
                logger.info("收到TERM信号，开始优雅关闭...");
                handleShutdown();
                break;
            case "INT":
                logger.info("收到INT信号（Ctrl+C），开始优雅关闭...");
                handleShutdown();
                break;
            default:
                logger.info("收到未知信号: {}", signal.getName());
        }
    }

    private void handleShutdown() {
        try {
            // 记录当前运行状态
            logger.info("系统状态：活动线程数={}", Thread.activeCount());
            
            // 执行清理操作
            logger.info("开始执行清理操作...");
            
            // 通知Spring容器关闭
            if (context != null) {
                ((org.springframework.context.ConfigurableApplicationContext) context).close();
            }
            
            logger.info("系统清理完成，准备退出");
        } catch (Exception e) {
            logger.error("关闭过程中发生错误", e);
        }
    }

    public static void registerSignalHandlers(ApplicationContext context) {
        SignalHandlerImpl handler = new SignalHandlerImpl(context);
        try {
            Signal.handle(new Signal("TERM"), handler);
            Signal.handle(new Signal("INT"), handler);
            logger.info("信号处理器注册成功");
        } catch (IllegalArgumentException e) {
            logger.warn("信号处理器注册失败：{}", e.getMessage());
        }
    }
}