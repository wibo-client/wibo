请分析当前问题并对比历史问题，判断是否存在相似的问题。

当前问题：{currentQuestion}

历史问题列表：
{historyQuestions}

请按照以下JSON格式返回结果：
\{
    "similarQuestions": [
        \{
            "taskId": "历史问题ID",
            "similarity": "相似度(0-100)",
            "reason": "简要说明相似原因"
        \}
    ]
\}

注意：
1. 只返回相似度大于70的问题
2. 相似度判断要考虑问题的核心意图
3. 相似问题按相似度从高到低排序
