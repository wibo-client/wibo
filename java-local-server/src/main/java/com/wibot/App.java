package com.wibot;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.ComponentScan;

/**
 * Hello world!
 *
 */

@SpringBootApplication
@ComponentScan(basePackages = "com.wibot")
public class App {
    public static void main(String[] args) {
        // 获取 Java 虚拟机可以使用的最大内存
        long maxMemory = Runtime.getRuntime().maxMemory();

        long totalMemory = Runtime.getRuntime().totalMemory();

        long minMemory = Runtime.getRuntime().freeMemory();
        // 将最大内存转换为 MB
        long maxMemoryMB = maxMemory / (1024 * 1024);

        // 打印总内存
        System.out.println("系统总内存: " + totalMemory / (1024 * 1024) + " MB");

        // 打印空闲内存
        System.out.println("系统空闲内存: " + minMemory / (1024 * 1024) + " MB");

        // 打印最大内存
        System.out.println("系统最大内存: " + maxMemoryMB + " MB");

        // SignalHandlerImpl.registerSignalHandlers();
        ApplicationContext context = SpringApplication.run(App.class, args);
    }
}
