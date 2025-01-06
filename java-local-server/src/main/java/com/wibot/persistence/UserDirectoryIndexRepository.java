package com.wibot.persistence;

import com.wibot.persistence.entity.UserDirectoryIndexPO;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserDirectoryIndexRepository extends JpaRepository<UserDirectoryIndexPO, Long> {

    List<UserDirectoryIndexPO> findByIndexStatus(String status);

    @Query("SELECT u FROM UserDirectoryIndexPO u WHERE u.indexStatus = 'indexing' AND u.submitTime < :timeThreshold")
    List<UserDirectoryIndexPO> findStaleIndexingTasks(java.time.LocalDateTime timeThreshold);

    Optional<UserDirectoryIndexPO> findByDirectoryPath(String directoryPath);

    @Query("SELECT u FROM UserDirectoryIndexPO u WHERE u.directoryPath LIKE CONCAT(:directoryPath, '%')")
    List<UserDirectoryIndexPO> findByDirectoryPathStartsWith(String directoryPath);

}
