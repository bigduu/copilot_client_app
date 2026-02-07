# Bamboo Debug Mode 实现报告

## 实现内容

### 1. Server Debug 模式 ✅

**文件**: `bamboo/crates/bamboo-server/src/logging.rs` (新建)

功能：
- 结构化日志初始化 (`init_logging`)
- `DebugInfo` 结构化日志记录
- `DebugLogger` 日志记录器（支持文件输出）
- `Timer` 性能计时器

**Server 启动参数**:
```bash
# 使用 --debug 标志
bamboo-server --debug --port 8080

# 或使用环境变量
DEBUG=true bamboo-server

# 或使用 RUST_LOG
RUST_LOG=debug bamboo-server
```

### 2. Agent Loop Debug 输出 ✅

**文件**: `bamboo/crates/bamboo-server/src/agent_runner.rs`

输出内容：
- 每轮循环的开始/结束
- LLM 调用耗时
- 工具调用详情（名称、参数、结果）
- 消息历史变化
- Token 使用量统计

**示例输出**:
```
[DEBUG] [session-id] Starting agent loop with message: xxx
[DEBUG] [session-id] Starting round 1/3
[DEBUG] [session-id] Available tools: 0
[DEBUG] [session-id] LLM response completed in 1234ms, 50 tokens
[DEBUG] [session-id] Executing tool 1/1: weather
[DEBUG] [session-id] Tool weather completed in 100ms, success: true
```

### 3. SSE Event Debug ✅

**文件**: `bamboo/crates/bamboo-server/src/handlers/stream.rs`

输出内容：
- SSE 连接/断开时间
- 每个事件的内容
- 事件数量统计
- 流持续时间

**示例输出**:
```
[DEBUG] [session-id] SSE stream request received
[DEBUG] [session-id] Found existing session with 2 messages
[DEBUG] [session-id] SSE: ToolStart - weather
[DEBUG] [session-id] SSE: ToolComplete - success: true
[DEBUG] [session-id] Stream completed: 15 events, 100 tokens, 2.3s elapsed
```

### 4. CLI Debug 模式 ✅

**文件**: `bamboo/crates/bamboo-cli/src/main.rs`

**启动参数**:
```bash
# 使用 --debug 或 -d 标志
bamboo-cli --debug send "你好"
bamboo-cli -d stream "你好"
```

输出内容：
- HTTP 请求详情（URL、Headers、Body）
- SSE 事件接收详情
- 连接耗时统计
- 错误详情

**示例输出**:
```
[DEBUG] Server URL: http://localhost:8080
[DEBUG] POST http://localhost:8080/api/v1/chat
[DEBUG] Request body: {"message":"你好"}
[DEBUG] Response: 201 Created in 6.3ms
[DEBUG] Connecting SSE: /api/v1/stream/xxx
[DEBUG] Received event 1: Token { content: "我" }
[DEBUG] Stream completed: 10 events in 2.1s
```

## 使用方法

### Server Debug
```bash
# 方式 1: 命令行参数
cargo run -p bamboo-server -- --debug

# 方式 2: 环境变量
DEBUG=true cargo run -p bamboo-server

# 方式 3: RUST_LOG
RUST_LOG=debug cargo run -p bamboo-server

# 指定端口
DEBUG=true cargo run -p bamboo-server -- --port 9090
```

### CLI Debug
```bash
# 全局 debug 标志
cargo run -p bamboo-cli -- --debug chat
cargo run -p bamboo-cli -- --debug send "你好"
cargo run -p bamboo-cli -- -d stream "你好"

# 组合使用
cargo run -p bamboo-cli -- --server-url http://localhost:9090 --debug send "测试"
```

### 日志文件输出
当 debug 模式启用时，日志会同时输出到：
1. 标准输出（带颜色）
2. `~/.bamboo/debug.log`（JSON Lines 格式）

## 测试验证

运行测试脚本：
```bash
./scripts/test-debug.sh
```

测试输出示例：
```
🧪 Testing Debug Mode
====================

📋 Test 1: Server --help
      --debug                  Enable debug mode [env: DEBUG=]
      --port <PORT>            Server port [env: PORT=] [default: 8080]

📋 Test 2: CLI --help
  -d, --debug                    Enable debug mode

📋 Test 3: Server debug mode
[2026-02-01 04:24:29.454] DEBUG [bamboo_server] bamboo_server - Debug mode enabled
[2026-02-01 04:24:29.454] DEBUG [bamboo_server] bamboo_server - Server configuration:
[2026-02-01 04:24:29.454] DEBUG [bamboo_server] bamboo_server -   Port: 18080
[2026-02-01 04:24:29.454] DEBUG [bamboo_server] bamboo_server -   Debug: true

✅ Debug mode tests completed!
```

## 修改文件清单

1. ✅ `bamboo/crates/bamboo-server/src/logging.rs` (新建)
2. ✅ `bamboo/crates/bamboo-server/src/main.rs` (添加 debug flag)
3. ✅ `bamboo/crates/bamboo-server/src/agent_runner.rs` (添加 debug 日志)
4. ✅ `bamboo/crates/bamboo-server/src/handlers/stream.rs` (添加 SSE debug)
5. ✅ `bamboo-server/Cargo.toml` (添加 chrono, clap)
6. ✅ `bamboo/crates/bamboo-cli/src/main.rs` (添加 --debug flag)
7. ✅ `scripts/test-debug.sh` (新建测试脚本)

## 输出格式

**标准输出**（带颜色）:
```
[2026-02-01 04:24:29.454] DEBUG [module] target - message
```

**日志文件**（JSON）:
```json
{"session_id":"xxx","event_type":"agent_loop_start","timestamp":"2026-02-01T04:24:29.454Z","details":{"message":"test","max_rounds":3}}
```

## 完成状态

- [x] Server Debug 模式
- [x] Agent Loop Debug 输出
- [x] SSE Event Debug
- [x] CLI Debug 模式
- [x] 环境变量支持 (DEBUG, RUST_LOG)
- [x] 结构化日志文件
- [x] 性能计时器
