# Bamboo 测试指南

## 快速开始

### 环境要求

- Rust 1.70+
- OpenAI API Key (可选，用于真实 LLM 测试)
- curl 或 HTTP 客户端
- 端口 8080 可用

### 设置环境变量

```bash
export OPENAI_API_KEY="sk-your-api-key"
```

如果不设置，将使用 `sk-test-key` (会导致 LLM 调用失败，但 API 测试仍可通过)

## 手动测试步骤

### 1. 构建项目

```bash
cd ~/workspace/copilot_client_app

# Debug 构建（快速）
cargo build -p bamboo-server -p bamboo-cli

# Release 构建（优化）
cargo build -p bamboo-server -p bamboo-cli --release
```

### 2. 启动 Server

```bash
# 基本启动
cargo run -p bamboo-server

# Debug 模式（详细日志）
DEBUG=true cargo run -p bamboo-server

# 指定端口
DEBUG=true cargo run -p bamboo-server -- --port 9090
```

预期输出：
```
[2026-02-01 04:29:30.208] INFO [bamboo_server] - Starting Bamboo Server on port 8080
[2026-02-01 04:29:30.220] INFO [actix_server::server] - starting service: "actix-web-service-0.0.0.0:8080"
```

### 3. 测试 Health Endpoint

```bash
curl http://localhost:8080/api/v1/health
```

预期输出：
```
OK
```

### 4. 创建会话

```bash
curl -X POST http://localhost:8080/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello"}'
```

预期输出：
```json
{
  "session_id": "28e4fb70-d6f4-457b-b282-b89c55932fb9",
  "stream_url": "/api/v1/stream/28e4fb70-d6f4-457b-b282-b89c55932fb9",
  "status": "streaming"
}
```

### 5. 获取历史记录

```bash
curl http://localhost:8080/api/v1/history/{session_id}
```

### 6. 测试 SSE Stream

```bash
curl -N http://localhost:8080/api/v1/stream/{session_id}
```

### 7. 使用 CLI

```bash
# 基本发送
cargo run -p bamboo-cli -- send "你好"

# Debug 模式
cargo run -p bamboo-cli -- --debug send "你好"

# 交互式聊天
cargo run -p bamboo-cli -- chat

# 查看历史
cargo run -p bamboo-cli -- history --session-id {session_id}
```

## 自动化测试

### 运行单元测试

```bash
# 所有测试
cargo test -p bamboo-core -p bamboo-llm -p bamboo-server

# 单个 crate
cargo test -p bamboo-core
```

### 运行 E2E 测试

```bash
# 简化版 E2E 测试（推荐）
./scripts/e2e-simple.sh

# 完整版 E2E 测试（需要真实 OpenAI key）
export OPENAI_API_KEY="sk-your-key"
./scripts/e2e-test.sh
```

## 预期输出示例

### Server 启动 (Debug 模式)

```
[2026-02-01 04:29:30.208] INFO [bamboo_server] - Starting Bamboo Server on port 8080
[2026-02-01 04:29:30.209] DEBUG [bamboo_server] - Debug mode enabled
[2026-02-01 04:29:30.209] DEBUG [bamboo_server] - Server configuration:
[2026-02-01 04:29:30.209] DEBUG [bamboo_server] -   Port: 8080
[2026-02-01 04:29:30.209] DEBUG [bamboo_server] -   Debug: true
```

### Agent Loop Debug

```
[DEBUG] [session-id] Starting agent loop with message: Hello
[DEBUG] [session-id] Starting round 1/3
[DEBUG] [session-id] LLM response completed in 1234ms, 50 tokens
[DEBUG] [session-id] Executing tool: weather
[DEBUG] [session-id] Tool weather completed in 100ms, success: true
```

### CLI Debug

```
[DEBUG] POST http://localhost:8080/api/v1/chat
[DEBUG] Request body: {"message":"Hello"}
[DEBUG] Response: 201 Created in 6.3ms
[DEBUG] Stream completed: 10 events in 2.1s
```

## 常见问题排查

### 问题 1: 端口被占用

```bash
# 检查端口占用
lsof -i :8080

# 关闭占用进程
kill $(lsof -t -i:8080)
```

### 问题 2: OpenAI API 错误

如果看到：
```
HTTP 401 Unauthorized: Incorrect API key
```

解决方案：
- 检查 `OPENAI_API_KEY` 是否正确设置
- 使用真实 API key 进行测试
- 或者仅测试 API 端点（跳过 LLM 调用）

### 问题 3: 编译错误

```bash
# 清理并重新构建
cargo clean
cargo build -p bamboo-server -p bamboo-cli
```

### 问题 4: SSE 连接失败

检查：
- Server 是否正常运行
- 会话 ID 是否正确
- 防火墙是否允许连接

```bash
# 测试 SSE
curl -v -N http://localhost:8080/api/v1/stream/{session_id}
```

## 测试检查清单

- [ ] Server 启动并监听端口
- [ ] Health endpoint 返回 OK
- [ ] POST /chat 返回 session_id
- [ ] GET /history 返回消息历史
- [ ] SSE /stream 可连接
- [ ] CLI 工具可执行
- [ ] Debug 日志正常输出
- [ ] 消息持久化到文件

## 日志文件位置

- **Server 日志**: 标准输出 / `~/.bamboo/debug.log`
- **会话数据**: `~/.bamboo/{session_id}.json`

## 性能测试

```bash
# 使用 release 构建进行性能测试
cargo build --release -p bamboo-server

# 测试并发连接
ab -n 100 -c 10 http://localhost:8080/api/v1/health
```
