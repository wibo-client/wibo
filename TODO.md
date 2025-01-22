# V1.0.0
## 初步能把项目跑起来

# V1.5.0 
## requery ok
## 聊天记录存储 ok . copilot只用两次迭代就搞定了。。太牛了
## 页面url点击后也要本地跳转 ok
## url 访问过的就换成转换后的url ok
## 长度随着页面变化而变化 ok
## 支持复制粘贴 ok
## 增加一个新能力 深问能力 。 ok
## 默认要允许调整 default ok 
## 追踪能力，要知道原来哪篇文章，增加trace逻辑路径优化，让他更清晰 ok
## 按上的时候，可以自动找回上一次的内容 ok
## 要支持对单文件的能力 那也就要增加对单文件的返回 ok
## 百度的Rerwite 搞起来。 ok 
## [Object object]问题优化 ok
## 预研：考虑减少包大小，主要是chrome的可行方法 ok. need test
## 预研：减少jvm和spirng的大小
## 预研：提高spring启动速度 
## 优先windows release ok
## 增加日志能力 ok
## 支持用 / *xxx的方式，来允许用户使用特定的文档全量做处理。 ok 

# V1.6.0
## 优化一个小bug。debug的时候会自己关闭进程。 ok

## 增加一个停止当前任务的能力 ok

## 增加删除 聊天记录 ok
## 知乎搜索能力增强
## 基于精炼事实，来做summary

# 暂时不做了
## 本地优先作为 default 
## 增加对日期的识别考虑日期问题 ，尤其是在local
## TODO 把extractKeyFacts 和 refineContent 移动到java端。提高性能



从设计来说：
1） rewrite query

2) search 返回一组summary 

3) rerank 返回最相关的内容 

4）detail 

5）map reduce 

6）染回