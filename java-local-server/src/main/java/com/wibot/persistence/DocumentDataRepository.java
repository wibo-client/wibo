package com.wibot.persistence;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.ListCrudRepository;
import org.springframework.stereotype.Repository;

import com.wibot.persistence.entity.DocumentDataPO;

@Repository
public interface DocumentDataRepository
                extends ListCrudRepository<DocumentDataPO, Long>, JpaSpecificationExecutor<DocumentDataPO> {

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
        void updateLastProcessingUpdateForProcessor(String processorId, LocalDateTime lastProcessingUpdate,
                        String processedState);

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
        List<DocumentDataPO> findByProcessedStateInOrderById(List<String> states, Pageable pageable);

}