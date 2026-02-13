# 修复 Anthropic 转发 Metrics 记录

## 问题

用户报告使用 Anthropic 转发时，metrics 页面没有显示任何数据。

## 原因

之前只在 OpenAI 控制器的转发中实现了 metrics 记录，Anthropic 控制器（`/anthropic/v1/messages` 和 `/anthropic/v1/complete`）的转发没有记录 metrics。

## 解决方案

在 Anthropic 控制器中添加了与 OpenAI 控制器相同的 metrics 记录逻辑。

### 修改文件

**`crates/web_service/src/controllers/anthropic/mod.rs`**

1. **添加必要的 imports**
   ```rust
   use agent_server::state::AppState as AgentAppState;
   use chrono::Utc;
   use uuid::Uuid;
   ```

2. **修改 `messages` handler**
   - 添加 `agent_state: web::Data<AgentAppState>` 参数
   - 在请求开始时记录 `forward_started`（endpoint: "anthropic.messages"）
   - 在所有错误路径和成功路径记录 `forward_completed`
   - 支持流式和非流式请求
   - 提取 token usage（非流式请求）

3. **修改 `complete` handler**
   - 添加 `agent_state: web::Data<AgentAppState>` 参数
   - 在请求开始时记录 `forward_started`（endpoint: "anthropic.complete"）
   - 在所有错误路径和成功路径记录 `forward_completed`
   - 支持流式和非流式请求
   - 提取 token usage（非流式请求）

### Metrics 记录点

每个 handler 都在以下位置记录 metrics：

1. **开始时**：生成 forward_id，记录 forward_started
2. **模型解析失败**：记录错误信息
3. **请求转换失败**：记录错误信息
4. **上游 API 请求失败**：记录错误信息
5. **上游 API 返回错误状态**：记录状态码和错误信息
6. **流式请求完成**：在后台任务中记录成功或失败
7. **非流式请求成功**：记录成功和 token usage
8. **响应解析失败**：记录错误信息

### Endpoint 命名

- `anthropic.messages` - 对应 `/anthropic/v1/messages`
- `anthropic.complete` - 对应 `/anthropic/v1/complete`

## 测试

1. **编译测试**：✅ 通过
2. **单元测试**：✅ 通过
3. **功能测试**：需要用户验证

## 使用说明

现在 Anthropic 转发请求也会被记录到 metrics 中，可以在前端的 Metrics 页面看到：

1. **Forward Metrics Cards** - 显示 Anthropic 转发的总体统计
2. **Endpoint Distribution** - 显示 "anthropic.messages" 和 "anthropic.complete" 的分布
3. **Recent Forward Requests** - 显示详细的 Anthropic 转发请求列表

## 数据示例

使用 Anthropic SDK 发送请求后，会记录如下数据：

```json
{
  "forward_id": "550e8400-e29b-41d4-a716-446655440000",
  "endpoint": "anthropic.messages",
  "model": "claude-sonnet-4-5-20250929",
  "is_stream": false,
  "started_at": "2026-02-12T17:51:28Z",
  "completed_at": "2026-02-12T17:51:29Z",
  "status_code": 200,
  "status": "success",
  "token_usage": {
    "prompt_tokens": 150,
    "completion_tokens": 250,
    "total_tokens": 400
  },
  "error": null,
  "duration_ms": 1000
}
```

## 注意事项

1. **流式请求**：由于流式响应不包含 token usage 信息，`token_usage` 字段为 `null`
2. **模型映射**：记录的 model 是原始请求的 model（如 "claude-sonnet-4-5-20250929"），而不是映射后的 model
3. **错误追踪**：所有错误都会记录详细信息，方便调试

## 相关文档

- [转发 Metrics 后端实现](./FORWARD_METRICS_IMPLEMENTATION.md)
- [转发 Metrics 前端实现](./FORWARD_METRICS_FRONTEND.md)
