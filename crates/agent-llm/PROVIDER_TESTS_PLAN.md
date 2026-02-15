# Provider 测试补充计划

## 当前测试覆盖情况

| Provider | 现有测试 | 状态 | 目标 |
|----------|---------|------|------|
| **Gemini** | 18 个 | ✅ 充足 | 维持 |
| **Anthropic** | 22 个 | ⚠️ 集中在 mod.rs | 重构+补充 |
| **Copilot** | 2 个 | ❌ 严重不足 | +15 个 |
| **OpenAI** | 0 个 | ❌ 缺失 | +15 个 |
| **总计** | 42 个 | - | **72+ 个** |

## 需要补充的测试

### 1. Copilot Provider (+15 个测试)

**文件**: `providers/copilot/mod.rs`

#### 基础测试 (5 个)
- [ ] `test_new_provider` - 已存在 ✅
- [ ] `test_with_token` - 已存在 ✅
- [ ] `test_default_values` - 验证默认值
- [ ] `test_with_token_chaining` - 测试 builder 链式调用
- [ ] `test_token_expiry` - 测试 token 过期逻辑

#### Headers 测试 (3 个)
- [ ] `test_build_headers_success` - 成功构建 headers
- [ ] `test_build_headers_without_token` - 无 token 时构建 headers
- [ ] `test_headers_contain_required_fields` - 验证必需的 header 字段

#### 认证测试 (5 个)
- [ ] `test_is_authenticated_with_token` - 有 token 时认证状态
- [ ] `test_is_authenticated_without_token` - 无 token 时认证状态
- [ ] `test_logout_clears_token` - logout 清除 token
- [ ] `test_token_cache_save_load` - token 缓存保存和加载
- [ ] `test_try_authenticate_silent_with_cache` - 静默认证

#### 错误处理 (2 个)
- [ ] `test_chat_stream_without_auth_fails` - 未认证时调用失败
- [ ] `test_invalid_token_error` - 无效 token 错误处理

---

### 2. OpenAI Provider (+15 个测试)

**文件**: `providers/openai/mod.rs` (新建测试模块)

#### 基础测试 (5 个)
- [ ] `test_new_provider` - 创建 provider
- [ ] `test_with_base_url` - 自定义 base URL
- [ ] `test_with_model` - 自定义 model
- [ ] `test_default_values` - 验证默认值
- [ ] `test_chained_builders` - builder 链式调用

#### 请求构建测试 (4 个)
- [ ] `test_request_url_construction` - 请求 URL 构建
- [ ] `test_authorization_header` - Authorization header
- [ ] `test_request_body_format` - 请求体格式
- [ ] `test_max_tokens_included` - max_tokens 参数

#### 流式响应测试 (4 个)
- [ ] `test_parse_simple_token` - 解析简单 token
- [ ] `test_parse_tool_call` - 解析工具调用
- [ ] `test_parse_done_signal` - 解析完成信号
- [ ] `test_parse_error_response` - 解析错误响应

#### 错误处理 (2 个)
- [ ] `test_api_error_handling` - API 错误处理
- [ ] `test_network_error_retry` - 网络错误处理

---

### 3. Anthropic Provider (重构 + 补充)

**现有**: 22 个测试在 `mod.rs` 中

**需要重构**:
- 将 stream 相关测试移到 `stream.rs`
- 添加新的测试模块

#### 新增测试 (5 个)

**文件**: `providers/anthropic/mod.rs`

##### 基础测试
- [ ] `test_with_max_tokens` - max_tokens 配置
- [ ] `test_custom_base_url` - 自定义 base URL
- [ ] `test_model_selection` - model 选择

##### 请求测试
- [ ] `test_request_headers` - 请求 headers 验证
- [ ] `test_error_response_handling` - 错误响应处理

**文件**: `providers/anthropic/stream.rs` (新建测试模块)

##### 移动现有测试 (从 mod.rs)
- 所有 stream 相关测试移到这里

---

### 4. Common Utilities 测试

**文件**: `providers/common/sse.rs`

- [ ] 添加 SSE 解析工具的测试

---

## 测试模板

### Provider 基础测试模板

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_provider() {
        let provider = MyProvider::new("test_key");
        assert_eq!(provider.api_key, "test_key");
        assert_eq!(provider.model, "default-model");
    }

    #[test]
    fn test_with_base_url() {
        let provider = MyProvider::new("test_key")
            .with_base_url("https://custom.api.com");
        assert_eq!(provider.base_url, "https://custom.api.com");
    }

    #[test]
    fn test_with_model() {
        let provider = MyProvider::new("test_key")
            .with_model("custom-model");
        assert_eq!(provider.model, "custom-model");
    }

    #[test]
    fn test_chained_builders() {
        let provider = MyProvider::new("test_key")
            .with_base_url("https://custom.api.com")
            .with_model("custom-model");

        assert_eq!(provider.api_key, "test_key");
        assert_eq!(provider.base_url, "https://custom.api.com");
        assert_eq!(provider.model, "custom-model");
    }
}
```

### 流式解析测试模板

```rust
#[test]
fn test_parse_text_chunk() {
    let mut state = MyStreamState::default();
    let data = r#"{"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}"#;

    let chunk = parse_sse_event(&mut state, "", data).unwrap();

    match chunk {
        Some(LLMChunk::Token(text)) => assert_eq!(text, "Hello"),
        _ => panic!("Expected Token chunk"),
    }
}

#[test]
fn test_parse_done_signal() {
    let mut state = MyStreamState::default();
    let chunk = parse_sse_event(&mut state, "done", "[DONE]").unwrap();

    assert!(matches!(chunk, Some(LLMChunk::Done)));
}
```

---

## 实施优先级

### Phase 1: OpenAI Provider (最高优先级)
- 完全缺失测试
- 是最基础的 provider

### Phase 2: Copilot Provider
- 测试严重不足
- 认证逻辑需要覆盖

### Phase 3: Anthropic 重构
- 已有测试，需要重组
- 补充缺失的场景

---

## 验收标准

每个 provider 测试模块必须包含：

1. **基础测试**: 构造函数、builder 方法
2. **配置测试**: 各种配置选项
3. **请求构建测试**: URL、headers、body
4. **响应解析测试**: 各种响应格式
5. **错误处理测试**: 各种错误场景

**最低要求**: 每个 provider 至少 15 个测试

---

## 执行计划

### Agent 1: OpenAI Provider 测试
- 创建 `providers/openai/mod.rs` 测试模块
- 实现 15+ 个测试

### Agent 2: Copilot Provider 测试
- 扩展 `providers/copilot/mod.rs` 测试模块
- 实现 15+ 个测试

### Agent 3: Anthropic 重构
- 重构现有测试
- 添加新测试

---

## 测试运行

完成后运行：

```bash
# 运行所有 provider 测试
cargo test -p agent-llm --lib providers

# 单独测试每个 provider
cargo test -p agent-llm --lib providers::openai
cargo test -p agent-llm --lib providers::copilot
cargo test -p agent-llm --lib providers::anthropic
cargo test -p agent-llm --lib providers::gemini

# 验证总数
cargo test -p agent-llm --lib 2>&1 | grep "test result"
```

预期结果：**72+ 个测试通过**

---

## 注意事项

1. **不要使用网络调用**: 所有测试应该是单元测试，使用 mock
2. **测试隔离**: 每个测试应该独立，不依赖其他测试
3. **描述性命名**: 测试名称应清楚描述测试内容
4. **覆盖边界情况**: 不仅测试正常路径，也要测试错误情况
5. **使用 `#[ignore]`**: 对于需要实际 API 的集成测试，使用 `#[ignore]`

---

## 参考资源

- `providers/gemini/mod.rs` - 完整的测试示例
- `providers/gemini/stream.rs` - 流式解析测试示例
- `providers/common/openai_compat.rs` - 工具函数测试示例
