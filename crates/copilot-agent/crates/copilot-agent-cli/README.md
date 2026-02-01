# Copilot Agent CLI

CLI 工具用于验证 copilot-agent 的功能，无需 UI 即可测试。

## 用法

```bash
# 查看帮助
cargo run -p copilot-agent-cli -- --help

# 启动交互式聊天
OPENAI_API_KEY=sk-your-key cargo run -p copilot-agent-server &
cargo run -p copilot-agent-cli -- chat

# 发送单条消息
cargo run -p copilot-agent-cli -- send "你好"

# 测试 SSE 流式输出
cargo run -p copilot-agent-cli -- stream "查一下广州天气"

# 查看历史（指定 session-id）
cargo run -p copilot-agent-cli -- history --session-id xxx
```

## 命令

- **chat** - 启动交互式聊天会话
- **send** - 发送单条消息并获取响应
- **stream** - 测试 SSE 流式输出
- **history** - 查看指定会话的历史记录

## 选项

- `--server-url <URL>` - Agent server URL (默认: http://localhost:8080)
- `--session-id <ID>` - 指定会话 ID

## 环境变量

- `OPENAI_API_KEY` - OpenAI API 密钥（用于 server）
- `PORT` - Server 端口（默认: 8080）
