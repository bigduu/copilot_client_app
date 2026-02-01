# localhost:12123 配置更新与测试报告

## 更新内容

### 1. 新增配置参数

**Server 现在支持以下参数**：

```bash
copilot-agent-server --help

Options:
      --debug                        Enable debug mode
      --port <PORT>                  Server port [default: 8080]
      --llm-base-url <LLM_BASE_URL>  LLM API base URL [default: http://localhost:12123]
      --model <MODEL>                LLM model name [default: kimi-for-coding]
      --api-key <API_KEY>            LLM API key [default: sk-test]
      --log-level <LOG_LEVEL>        Log level
```

### 2. 修改的文件

| 文件 | 修改内容 |
|------|----------|
| `src/main.rs` | 添加 `--llm-base-url`, `--model`, `--api-key` 参数 |
| `src/server.rs` | 添加 `run_server_with_config()` 函数 |
| `src/state.rs` | 添加 `new_with_config()` 方法 |
| `src/lib.rs` | 导出 `run_server_with_config` |

## 测试结果

### 启动日志

```
[2026-02-01 04:44:17.752] INFO - Starting Copilot Agent Server on port 8080
[2026-02-01 04:44:17.753] INFO - LLM Configuration:
[2026-02-01 04:44:17.753] INFO -   Base URL: http://localhost:12123
[2026-02-01 04:44:17.753] INFO -   Model: kimi-for-coding
[2026-02-01 04:44:17.753] DEBUG - LLM Base URL: http://localhost:12123
[2026-02-01 04:44:17.753] DEBUG - LLM Model: kimi-for-coding
```

### LLM 连接测试

```
[2026-02-01 04:44:18.052] DEBUG - starting new connection: http://localhost:12123/
[2026-02-01 04:44:18.053] DEBUG - connecting to [::1]:12123
[2026-02-01 04:44:18.053] DEBUG - connected to [::1]:12123
[2026-02-01 04:44:18.066] DEBUG - pooling idle connection for ("http", localhost:12123)
[2026-02-01 04:44:18.066] DEBUG - LLM stream created successfully
[2026-02-01 04:44:18.066] DEBUG - llm_request completed in 14ms
```

### 测试状态

| 项目 | 结果 | 说明 |
|------|------|------|
| Server 启动 | ✅ 成功 | 配置加载正确 |
| 参数解析 | ✅ 成功 | 所有参数生效 |
| LLM 连接 | ✅ 成功 | 14ms 内连接成功 |
| API 调用 | ⚠️ 部分 | 连接成功但返回空内容 |
| SSE 流式 | ✅ 成功 | 正常完成 |
| 消息持久化 | ✅ 成功 | 3 条消息已保存 |

## 发现的问题

### 问题：LLM 返回空内容

**现象**：
```
LLM response completed in 14ms, 0 tokens received
No tool calls, completing
content length: 0
```

**分析**：
1. ✅ 连接到 localhost:12123 成功
2. ✅ HTTP 请求发送成功
3. ⚠️ 返回的响应中没有 token 数据

**可能原因**：
1. localhost:12123 服务期望不同的请求格式
2. 需要特定的认证头
3. 服务未完全启动或模型未加载
4. 请求路径或参数不匹配

## 使用方式

### 启动 Server（使用 localhost:12123）

```bash
# 使用默认配置（localhost:12123）
./target/release/copilot-agent-server

# 或明确指定
./target/release/copilot-agent-server \
  --llm-base-url http://localhost:12123 \
  --model kimi-for-coding \
  --api-key "sk-test"

# Debug 模式
DEBUG=true ./target/release/copilot-agent-server \
  --llm-base-url http://localhost:12123 \
  --model kimi-for-coding
```

### 环境变量方式

```bash
export LLM_BASE_URL=http://localhost:12123
export LLM_MODEL=kimi-for-coding
export LLM_API_KEY=sk-test
export DEBUG=true

./target/release/copilot-agent-server
```

### 测试 CLI

```bash
./target/release/copilot-agent-cli send "你好"
./target/release/copilot-agent-cli stream "讲个笑话"
```

## 下一步建议

1. **检查 localhost:12123 服务的 API 格式**
   - 确认是否兼容 OpenAI API 格式
   - 检查需要的请求头
   - 验证模型名称是否正确

2. **测试直接调用**
   ```bash
   curl http://localhost:12123/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"kimi-for-coding","messages":[{"role":"user","content":"hello"}]}'
   ```

3. **如果服务不兼容 OpenAI 格式**
   - 需要创建自定义 LLM Provider
   - 适配本地服务的 API 格式

## 结论

✅ **配置更新成功**

Server 现在可以：
- 配置任意 LLM base URL
- 配置模型名称
- 配置 API key
- 成功连接到 localhost:12123

⚠️ **需要进一步调试**

本地 LLM 服务返回空响应，需要检查：
- 服务是否正确运行
- API 格式是否匹配
- 模型是否正确加载
