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
## 基于精炼事实，来做summary
## 知识精炼 能力 
## 进一步要增强验证一下java的自动关闭，生命周期管理。
## 添加新精炼任务

# 暂时不做了
## 知乎搜索能力增强
## 本地优先作为 default 
## 增加对日期的识别考虑日期问题 ，尤其是在local
## TODO 把extractKeyFacts 和 refineContent 移动到java端。提高性能


我现在要做一个新的功能。大概要做的事情是：
1）根据用户提的问题，从海量数据里面，精炼出一批能回答用户问题的内容。
2）以用户的输入作为key，把这些存到一个summary里面
3）然后针对这个summary构建索引。


我已经决定将这个功能命名为知识精炼 

我已经在index页面构造一个新的tab,叫知识精炼 ，里面有一张管理表格，里面的内容如下：


作用目录（递归）
关键问题
涵盖文件数
上次全量更新所消耗token估算
上次增量更新所消耗token估算
更新周期
命中次数
最后更新日期
创建日期
当前状态
操作

操作具体有：
手动全量更新
手动增量更新
增量更新
删除条目

然后
在合适的地方有一个“新增精炼任务“的按钮

具体的Html：

  <!-- 添加知识精炼内容区域 -->
  <div id="refinery" class="tab-content">
    <div class="refinery-container">
      <div class="refinery-header">
        <h3>知识精炼管理</h3>
        <button class="add-refinery-task">新增精炼任务</button>
      </div>
      <table class="refinery-table">
        <thead>
          <tr>
            <th>作用目录</th>
            <th>关键问题</th>
            <th>涵盖文件数</th>
            <th>全量Token消耗</th>
            <th>增量Token消耗</th>
            <th>更新周期</th>
            <th>命中次数</th>
            <th>最后更新</th>
            <th>创建日期</th>
            <th>当前状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>/docs/project-a</td>
            <td>如何实现项目部署？</td>
            <td class="stats-number">156</td>
            <td class="stats-number token-cost">2.3k</td>
            <td class="stats-number token-cost">0.5k</td>
            <td>每日</td>
            <td class="stats-number">42</td>
            <td>2024-01-20</td>
            <td>2024-01-15</td>
            <td><span class="status-badge status-active">活跃</span></td>
            <td>
              <div class="action-buttons">
                <button class="action-btn update-full">全量更新</button>
                <button class="action-btn update-incremental">增量更新</button>
                <button class="action-btn delete-btn">删除</button>
              </div>
            </td>
          </tr>
          <tr>
            <td>/docs/guides</td>
            <td>系统架构设计原则？</td>
            <td class="stats-number">89</td>
            <td class="stats-number token-cost">1.8k</td>
            <td class="stats-number token-cost">0.3k</td>
            <td>每周</td>
            <td class="stats-number">27</td>
            <td>2024-01-19</td>
            <td>2024-01-10</td>
            <td><span class="status-badge status-processing">处理中</span></td>
            <td>
              <div class="action-buttons">
                <button class="action-btn update-full">全量更新</button>
                <button class="action-btn update-incremental">增量更新</button>
                <button class="action-btn delete-btn">删除</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>


我现在需要：
1）构建一个可以处理上面内容的controller。 只需要空接口




public class RefineryFactDO {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String refineryTaskId;  // 关联的精炼任务ID
    
    @Column(nullable = false)
    private Long paragraphId;       // 关联的段落ID
    
    @Column(nullable = false, length = 4000)
    private String fact;            // 提取的事实内容
    
    @Column(nullable = false)
    private LocalDateTime createdTime;
    

    探讨一个设计问题。
    我现在需要额外的构建一个以上面三个为一组的索引。
    或者对既有的以paragraphid （在这个SimpleLocalLuceneIndex里面是docId) 为目标的索引，做增量更新。

    新的查询会根据


索引设计选项：
Option A: 在现有文档中添加新字段
Option B: 创建独立索引
Option C: 使用复合主键
推荐方案：Option A

为什么扩展现有方法而不是新建方法？

避免代码重复
保持索引一致性
便于维护和升级
为什么使用同一个indexWriter？

减少资源消耗
保证原子性操作
便于事务管理
为什么基于现有search改造？

复用已有的高亮、排序等功能
保持一致的搜索体验
减少维护成本