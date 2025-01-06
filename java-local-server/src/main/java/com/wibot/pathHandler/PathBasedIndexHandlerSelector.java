package com.wibot.pathHandler;

import java.util.List;

import com.wibot.index.DocumentIndexInterface;

public interface PathBasedIndexHandlerSelector {
    DocumentIndexInterface selectIndexHandler(String path);

    List<DocumentIndexInterface> getPossibleIndexHandlers(String path);
}
