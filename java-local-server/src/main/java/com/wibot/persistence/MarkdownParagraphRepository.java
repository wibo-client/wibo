package com.wibot.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import com.wibot.persistence.entity.MarkdownParagraphPO;

import java.util.List;

public interface MarkdownParagraphRepository extends JpaRepository<MarkdownParagraphPO, Long> {

    @Transactional
    void deleteByDocumentDataId(Long documentDataId);

    List<MarkdownParagraphPO> findByDocumentDataId(Long documentDataId);
}
