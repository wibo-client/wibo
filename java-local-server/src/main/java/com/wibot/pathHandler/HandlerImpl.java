package com.wibot.pathHandler;

import java.util.ArrayList;
import java.util.List;
import java.util.Map.Entry;
import java.util.NavigableMap;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import com.wibot.index.DocumentIndexInterface;

@Component
public class HandlerImpl implements PathBasedIndexHandlerSelector {
    private NavigableMap<String, DocumentIndexInterface> handlerMap = new TreeMap<>();

    @Autowired
    private DocumentIndexInterface defaultHandler;

    @Override
    public DocumentIndexInterface selectIndexHandler(String path) {

        // 查找最匹配的前缀
        String bestMatchPrefix = handlerMap.floorKey(path);
        if (bestMatchPrefix != null && path.startsWith(bestMatchPrefix)) {
            return handlerMap.get(bestMatchPrefix);
        }
        return defaultHandler;
    }

    @Override
    public List<DocumentIndexInterface> getPossibleIndexHandlers(String path) {
        List<DocumentIndexInterface> handlers = new ArrayList<>();
        // handlerMap.entrySet().stream()
        // .filter(entry -> entry.getKey().startsWith(path)).map(entry ->
        // entry.getValue())
        // .collect(Collectors.toList());

        for (Entry<String, DocumentIndexInterface> entry : handlerMap.entrySet()) {
            String key = entry.getKey();
            if (key.length() > path.length()) {
                key = key.substring(0, path.length());
            }
            if (path.startsWith(key)) {
                handlers.add(entry.getValue());
            }
        }
        handlers.add(defaultHandler);
        return handlers;
    }

}
