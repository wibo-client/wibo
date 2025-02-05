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



# V2.0.0
## 基于精炼事实，来做summary ，需要做一个验证，主要是看total数据是否正确更新。 以及batch是否正确。ok 
## 精炼事实 ,命中次数正常更新。  ok
## 确认一下，删除精炼的逻辑是否是正确的。 ok
## 添加新精炼任务 ok
## 对话历史日志是反的。 ok
## 历史信息里的设为常问 不能用, 修复  ok
## 正常百度 searchengine要重构 ok
## 进一步要增强验证一下java的自动关闭，生命周期管理。 mac验证了 ， windows todo .
## 404 local quick search 调对  ok 
## ignoreDirs 问题排查。-- 没复现。 但 增强了检查，理论应该是修复了 ok



# 暂时不做了
## 知乎搜索能力增强
## 参考资料部分感觉要再想想。 
## 本地优先作为 default 
## 增加对日期的识别考虑日期问题 ，尤其是在local
## TODO 把extractKeyFacts 和 refineContent 移动到java端。提高性能

# V2.1.0 