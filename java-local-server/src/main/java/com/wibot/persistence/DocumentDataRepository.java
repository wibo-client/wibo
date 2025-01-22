package com.wibot.persistence;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.ListCrudRepository;
import org.springframework.stereotype.Repository;

import com.wibot.persistence.entity.DocumentDataPO;

import org.springframework.data.repository.query.Param;

@Repository
public interface DocumentDataRepository
                extends JpaRepository<DocumentDataPO, Long>, JpaSpecificationExecutor<DocumentDataPO> {

        /**
         * Uses {@link Optional} as return and parameter type.
         *
         * @param username
         * @return
         */
        Optional<DocumentDataPO> findByFileName(String fileName);

        /**
         * 根据文件路径查找文档数据
         *
         * @param path 文件路径
         * @return 文档数据的Optional包装
         */
        Optional<DocumentDataPO> findByFilePath(String path);

        /**
         * 根据文件路径前缀查找文档数据
         *
         * @param path 文件路径前缀
         * @return 文档数据列表
         */
        List<DocumentDataPO> findByFilePathStartingWith(String path);

        /**
         * 根据处理状态查找文档数据
         *
         * @param processedState 处理状态
         * @return 文档数据列表
         */
        List<DocumentDataPO> findByProcessedState(String processedState);

        /**
         * 根据处理状态查找文档数据
         *
         * @param processedState 处理状态
         * @param pageable       分页信息
         * @return 文档数据列表
         */
        List<DocumentDataPO> findByProcessedState(String processedState, Pageable pageable);

        /**
         * 根据处理状态和最后处理更新时间查找文档数据
         *
         * @param processedState       处理状态
         * @param lastProcessingUpdate 最后处理更新时间
         * @param pageable             分页信息
         * @return 文档数据列表
         */
        List<DocumentDataPO> findByProcessedStateAndLastProcessingUpdateBefore(String processedState,
                        LocalDateTime lastProcessingUpdate, Pageable pageable);

        /**
         * 更新指定处理器的任务的最后处理更新时间
         *
         * @param processorId          处理器ID
         * @param lastProcessingUpdate 最后处理更新时间
         * @param processedState       处理状态
         */
        @Modifying
        @Query("UPDATE DocumentDataPO d SET d.lastProcessingUpdate = :lastProcessingUpdate WHERE d.processorId = :processorId AND d.processedState = :processedState")
        void updateLastProcessingUpdateForProcessor(@Param("processorId") String processorId, 
                                                    @Param("lastProcessingUpdate") LocalDateTime lastProcessingUpdate,
                                                    @Param("processedState") String processedState);

        // @Query("SELECT d FROM DocumentDataPO d WHERE d.filePath LIKE
        // CONCAT(:directoryPath, '%')")
        // List<DocumentDataPO> findByFilePathStartingWith(@Param("directoryPath")
        // String directoryPath);

        List<DocumentDataPO> findByProcessedStateIn(List<String> states, Pageable pageable);

        /**
         * 根据处理状态查找文档数据并按ID排序
         *
         * @param states   处理状态列表
         * @param pageable 分页信息
         * @return 文档数据列表
         */
        @Query("SELECT d FROM DocumentDataPO d WHERE d.processedState IN :states ORDER BY d.id ASC")
        List<DocumentDataPO> findByProcessedStateInOrderById(@Param("states") List<String> states, Pageable pageable);

        /**
         * 根据文件路径前缀和处理状态查找文档
         *
         * @param path 文件路径前缀
         * @param processedState 处理状态
         * @return 文档数据列表
         */
        List<DocumentDataPO> findByFilePathStartingWithAndProcessedState(String path, String processedState);

        /**
         * 根据文件路径前缀和多个处理状态查找文档
         *
         * @param path 文件路径前缀
         * @param processedStates 处理状态列表
         * @return 文档数据列表
         */
        List<DocumentDataPO> findByFilePathStartingWithAndProcessedStateIn(String path, List<String> processedStates);
        
        /**
         * 更新指定目录下所有文件的处理状态
         *
         * @param directoryPath 目录路径
         * @param oldState 原状态
         * @param newState 新状态
         */
        @Modifying
        @Query("UPDATE DocumentDataPO d SET d.processedState = :newState WHERE d.filePath LIKE CONCAT(:directoryPath, '%') AND d.processedState = :oldState")
        void updateProcessedStateByDirectory(@Param("directoryPath") String directoryPath, 
                                             @Param("oldState") String oldState, 
                                             @Param("newState") String newState);

        List<DocumentDataPO> findByFilePathLike(String filePathPattern);
        
        long countByFilePathStartingWith(String pathPrefix);
}