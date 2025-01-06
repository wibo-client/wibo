package com.wibot.persistence;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import com.wibot.persistence.entity.MarkdownBasedContentPO;

public interface MarkdownBasedContentRepository extends JpaRepository<MarkdownBasedContentPO, Long> {

    Optional<MarkdownBasedContentPO> findByDocumentDataId(Long documentDataId);

    @Query("SELECT m FROM MarkdownBasedContentPO m WHERE m.documentDataId IN (SELECT d.id FROM DocumentDataPO d WHERE d.filePath LIKE :pathPrefix%)")
    List<MarkdownBasedContentPO> findByDocumentDataFilePathStartsWith(String pathPrefix);

    @Transactional
    void deleteByDocumentDataId(Long documentDataId);

}
