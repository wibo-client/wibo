package com.wibot.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import com.wibot.persistence.entity.SystemConfigPO;
import java.util.Optional;

@Repository
public interface SystemConfigRepository extends JpaRepository<SystemConfigPO, Long> {
    Optional<SystemConfigPO> findByConfigKey(String configKey);

    void deleteByConfigKey(String configKey);
}
