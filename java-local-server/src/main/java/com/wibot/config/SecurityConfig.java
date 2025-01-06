package com.wibot.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {
    private static final Logger logger = LoggerFactory.getLogger(SecurityConfig.class);

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        logger.info("Configuring HttpSecurity");
        http.authorizeRequests(authorize -> {
            logger.info("Configuring authorization requests");
            authorize.anyRequest().permitAll(); // 允许所有请求无认证访问
        }).csrf(csrf -> {
            logger.info("Disabling CSRF protection");
            csrf.disable(); // 禁用 CSRF 保护
        }).headers(headers -> {
            headers.frameOptions().sameOrigin(); // 允许 H2 控制台使用 iframe
        }).formLogin().disable() // 禁用表单登录
                .httpBasic().disable(); // 禁用 HTTP 基本认证

        logger.info("HttpSecurity configuration complete");
        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}