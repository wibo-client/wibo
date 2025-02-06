package com.wibot.persistence;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

import com.wibot.persistence.entity.MarkdownParagraphPO;

import java.util.List;

public interface MarkdownParagraphRepository extends JpaRepository<MarkdownParagraphPO, Long> {

    @Transactional
    void deleteByDocumentDataId(Long documentDataId);

    List<MarkdownParagraphPO> findByDocumentDataId(Long documentDataId);

    // 添加按照id排序的查询方法
    List<MarkdownParagraphPO> findByDocumentDataIdOrderById(Long documentDataId);
}
