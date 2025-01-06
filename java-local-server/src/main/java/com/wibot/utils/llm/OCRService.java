package com.wibot.utils.llm;

import java.awt.image.BufferedImage;

public interface OCRService {
    String recognizeText(BufferedImage image);

}
