package com.wibot.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.wibot.pathHandler.HandlerConfig;

import java.util.Optional;

@Repository
public interface HandlerConfigRepository extends JpaRepository<HandlerConfig, Long> {
    Optional<HandlerConfig> findByPathPrefix(String pathPrefix);
}
