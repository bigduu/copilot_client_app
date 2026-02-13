# Token Usage 问题说明

## 现象

用户报告在 Anthropic 转发的 metrics 中看不到 token 信息。

## 原因分析

### 1. 流式请求不包含 token usage

根据 OpenAI API 规范，**流式（streaming）请求默认不返回 token usage 信息**。这是 API 的设计决定的：

- **非流式请求**：响应中包含 `usage` 字段，有完整的 token 统计
- **流式请求**：响应中的 `usage` 字段通常为 `null`

### 2. 代码实现

在 `ChatCompletionResponse` 中，`usage` 字段定义为 `Option<Usage>`：

```rust
pub struct ChatCompletionResponse {
    pub id: String,
    pub choices: Vec<ResponseChoice>,
    pub usage: Option<Usage>,  // 可选字段
    // ...
}
```

### 3. Metrics 记录逻辑

代码已经正确处理了这种情况：

```rust
let token_usage = completion.usage.as_ref().map(|u| {
    agent_metrics::TokenUsage {
        prompt_tokens: u.prompt_tokens as u64,
        completion_tokens: u.completion_tokens as u64,
        total_tokens: u.total_tokens as u64,
    }
});
```

如果 `usage` 是 `None`，则 `token_usage` 也是 `None`，metrics 会记录为 `null`。

## 调试日志

添加了调试日志来验证 token usage 的情况：

```rust
log::info!(
    "Anthropic request completed with token usage - prompt: {}, completion: {}, total: {}",
    u.prompt_tokens,
    u.completion_tokens,
    u.total_tokens
);

if token_usage.is_none() {
    log::warn!("Anthropic request completed but no token usage information available");
}
```

## 查看 Token Usage

### 方法 1：使用非流式请求

发送非流式请求（`stream: false`）可以看到完整的 token usage：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "messages": [...],
  "stream": false  // 使用非流式
}
```

### 方法 2：查看日志

启动应用后，在日志中查找：

```bash
# Token usage 可用
[INFO] Anthropic request completed with token usage - prompt: 100, completion: 200, total: 300

# Token usage 不可用（流式请求）
[WARN] Anthropic request completed but no token usage information available
```

### 方法 3：查看数据库

直接查询 SQLite 数据库：

```bash
sqlite3 ~/.bamboo/metrics.db
SELECT
  endpoint,
  model,
  is_stream,
  prompt_tokens,
  completion_tokens,
  total_tokens
FROM forward_request_metrics
WHERE endpoint LIKE 'anthropic%'
ORDER BY started_at DESC
LIMIT 10;
```

如果是流式请求，`prompt_tokens`、`completion_tokens` 和 `total_tokens` 会是 `NULL`。

## 前端展示

在前端的 Forward Metrics 页面：

- **统计卡片中的 "Total Tokens"**：只统计有 token usage 的请求
- **请求表格中的 "Tokens" 列**：
  - 非流式请求：显示具体数字（如 "400"）
  - 流式请求：显示 "-"（表示无数据）

## 未来改进

### 选项 1：从流式响应中估算

虽然流式响应不直接提供 usage，但可以通过计算：
- 输入 tokens：根据 messages 计算
- 输出 tokens：根据接收到的 chunk 数量估算

### 选项 2：使用 Anthropic 的 usage API

某些 API 提供额外的 usage 查询接口，可以在请求完成后查询。

### 选项 3：前端估算显示

在前端显示时，对于流式请求显示 "Stream" 或 "~" 而不是 "-"，提示用户这是流式请求。

## 相关问题

- [OpenAI API - Usage Statistics](https://platform.openai.com/docs/guides/text-generation/usage-statistics)
- [Anthropic API - Token Counting](https://docs.anthropic.com/claude/reference/tokens)

## 总结

- ✅ **非流式请求**：会显示完整的 token usage
- ℹ️ **流式请求**：不显示 token usage（这是 API 的限制）
- 📊 **统计汇总**：只包含有 token usage 的请求

如果需要查看 token 使用量，建议使用非流式请求，或者在日志中查看详细信息。
