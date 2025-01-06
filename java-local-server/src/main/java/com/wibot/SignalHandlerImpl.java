// package com.wibot;

// import org.slf4j.Logger;
// import org.slf4j.LoggerFactory;

// import sun.misc.Signal;
// import sun.misc.SignalHandler;

// public class SignalHandlerImpl implements SignalHandler {

//     private static final Logger logger = LoggerFactory.getLogger(SignalHandlerImpl.class);

//     @Override
//     public void handle(Signal signal) {
//         logger.info("Received signal !!!!!!!!!!!!!: " + signal.getName());

//         // 在这里添加更多的日志记录或其他操作

//     }

//     public static void registerSignalHandlers() {
//         SignalHandlerImpl handler = new SignalHandlerImpl();
//         Signal.handle(new Signal("TERM"), handler);
//         Signal.handle(new Signal("INT"), handler);
//     }
// }
