package com.wibot.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.wibot.persistence.entity.RefineryFactDO;
import java.util.List;


@Repository
public interface RefineryFactRepository extends JpaRepository<RefineryFactDO, Long> {
    
    List<RefineryFactDO> findByRefineryTaskId(Long refineryTaskId);
    
    List<RefineryFactDO> findByRefineryTaskIdAndParagraphId(Long refineryTaskId, Long paragraphId);
    
    @Query("SELECT DISTINCT f.paragraphId FROM RefineryFactDO f WHERE f.refineryTaskId = :taskId")
    List<Long> findDistinctParagraphIdsByRefineryTaskId(@Param("taskId") String taskId);
    
    void deleteByRefineryTaskId(Long refineryTaskId);
    
    @Query("SELECT COUNT(DISTINCT f.paragraphId) FROM RefineryFactDO f WHERE f.refineryTaskId = :taskId")
    long countDistinctParagraphsByTaskId(@Param("taskId") String taskId);

    void deleteByRefineryTaskIdAndParagraphId(Long refineryTaskId, Long paragraphId);
}
