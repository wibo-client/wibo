package com.wibot.persistence;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.wibot.persistence.entity.RefineryTaskDO;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface RefineryTaskRepository extends JpaRepository<RefineryTaskDO, Long> {

    // 基础查询方法
    List<RefineryTaskDO> findByStatus(String status);

    List<RefineryTaskDO> findByStatusIn(List<String> statuses);

    Optional<RefineryTaskDO> findByDirectoryPath(String directoryPath);

    // 分页查询
    Page<RefineryTaskDO> findAll(Pageable pageable);

    Page<RefineryTaskDO> findByStatus(String status, Pageable pageable);

    // 按更新时间查询
    List<RefineryTaskDO> findByLastUpdateTimeBefore(LocalDateTime time);

    List<RefineryTaskDO> findByStatusAndLastUpdateTimeBefore(String status, LocalDateTime time);

    // 按创建时间查询
    List<RefineryTaskDO> findByCreateTimeBetween(LocalDateTime startTime, LocalDateTime endTime);

    // 自定义查询
    @Query("SELECT r FROM RefineryTaskDO r WHERE r.status = :status AND r.directoryPath LIKE :pathPattern%")
    List<RefineryTaskDO> findByStatusAndDirectoryPathStartingWith(
            @Param("status") String status,
            @Param("pathPattern") String pathPattern);

    // 统计查询
    long countByStatus(String status);

    @Query("SELECT r.status, COUNT(r) FROM RefineryTaskDO r GROUP BY r.status")
    List<Object[]> countTasksByStatus();

    // 批量更新
    @Query("UPDATE RefineryTaskDO r SET r.status = :newStatus WHERE r.status = :oldStatus")
    void updateStatusForAll(@Param("oldStatus") String oldStatus, @Param("newStatus") String newStatus);

    // 检查是否存在
    boolean existsByDirectoryPath(String directoryPath);

    // 清理旧任务
    void deleteByStatusAndLastUpdateTimeBefore(String status, LocalDateTime time);

    // 添加新方法：根据目录路径和状态查找任务
    List<RefineryTaskDO> findByDirectoryPathLikeAndStatus(String directoryPath, String status);
}
