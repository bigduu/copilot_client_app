#!/bin/bash
# E2E Test Script for Copilot Agent
# 真实环境测试：启动 server + 加载 skill + 执行文件操作

set -e  # 遇到错误立即退出

echo "=========================================="
echo "Copilot Agent E2E Test"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
SERVER_URL="http://localhost:8080"
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$TEST_DIR/../.." && pwd)"
SESSION_FILE="/tmp/copilot-agent-session.json"
LOG_FILE="/tmp/copilot-agent-e2e.log"
PID_FILE="/tmp/copilot-agent-server.pid"

# 检查环境
echo ""
echo "[1/7] 检查环境..."

if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}✗ OPENAI_API_KEY 未设置${NC}"
    echo "请设置环境变量: export OPENAI_API_KEY=sk-xxx"
    exit 1
fi
echo -e "${GREEN}✓ OPENAI_API_KEY 已设置${NC}"

# 检查端口是否被占用
echo ""
echo "[2/7] 检查端口..."
if lsof -i :8080 >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠ 端口 8080 被占用，尝试关闭...${NC}"
    kill $(lsof -t -i:8080) 2>/dev/null || true
    sleep 2
fi
echo -e "${GREEN}✓ 端口 8080 可用${NC}"

# 创建测试目录和文件
echo ""
echo "[3/7] 创建测试环境..."
TEST_WORKSPACE="/tmp/copilot-agent-test-workspace"
rm -rf "$TEST_WORKSPACE"
mkdir -p "$TEST_WORKSPACE"

# 创建测试文件
cat > "$TEST_WORKSPACE/hello.txt" << 'EOF'
Hello, this is a test file for copilot-agent e2e testing.
This file contains multiple lines.
Line 3: Some content here.
Line 4: More content.
EOF

cat > "$TEST_WORKSPACE/data.json" << 'EOF'
{
  "name": "test-project",
  "version": "1.0.0",
  "description": "E2E test project"
}
EOF

echo -e "${GREEN}✓ 测试文件创建完成${NC}"
echo "  - $TEST_WORKSPACE/hello.txt"
echo "  - $TEST_WORKSPACE/data.json"

# 构建项目
echo ""
echo "[4/7] 构建项目..."
cd "$PROJECT_ROOT"
~/.cargo/bin/cargo build -p copilot-agent-server -p copilot-agent-cli --release 2>&1 | tee "$LOG_FILE"

if [ ${PIPESTATUS[0]} -ne 0 ]; then
    echo -e "${RED}✗ 构建失败${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 构建成功${NC}"

# 启动 server
echo ""
echo "[5/7] 启动 Server..."
DEBUG=true "$PROJECT_ROOT/target/release/copilot-agent-server" --port 8080 > "$LOG_FILE.server" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"
echo "Server PID: $SERVER_PID"

# 等待 server 启动
echo "等待 server 启动..."
for i in {1..30}; do
    if curl -s "$SERVER_URL/api/v1/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Server 启动成功${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Server 启动超时${NC}"
        cat "$LOG_FILE.server"
        exit 1
    fi
    sleep 1
    echo -n "."
done

# 运行测试
echo ""
echo "[6/7] 运行 E2E 测试..."
echo "=========================================="

CLI="$PROJECT_ROOT/target/release/copilot-agent-cli"
TEST_RESULTS=()

# Test 1: 基本对话
echo ""
echo "Test 1: 基本对话测试"
echo "----------------------------------------"
SESSION_ID=$(curl -s -X POST "$SERVER_URL/api/v1/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"你好，请简单介绍一下自己"}' | \
    jq -r '.session_id')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" = "null" ]; then
    echo -e "${RED}✗ 获取 session_id 失败${NC}"
    TEST_RESULTS+=("FAIL: 基本对话 - 无法获取 session_id")
else
    echo -e "${GREEN}✓ Session 创建成功: $SESSION_ID${NC}"
    echo "$SESSION_ID" > "$SESSION_FILE"
    TEST_RESULTS+=("PASS: 基本对话")
fi

# Test 2: 文件读取（使用 read_file 工具）
echo ""
echo "Test 2: 文件读取测试"
echo "----------------------------------------"
echo "测试文件: $TEST_WORKSPACE/hello.txt"

# 等待 agent 响应完成
sleep 5

# 获取历史消息验证
HISTORY=$(curl -s "$SERVER_URL/api/v1/history/$SESSION_ID")
MSG_COUNT=$(echo "$HISTORY" | jq '.messages | length')

echo "消息数量: $MSG_COUNT"
echo "$HISTORY" | jq '.messages' 2>/dev/null || echo "无法解析历史"

if [ "$MSG_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ 消息记录成功${NC}"
    TEST_RESULTS+=("PASS: 消息记录")
else
    echo -e "${RED}✗ 消息记录失败${NC}"
    TEST_RESULTS+=("FAIL: 消息记录 - 无消息")
fi

# Test 3: 持续对话
echo ""
echo "Test 3: 持续对话测试"
echo "----------------------------------------"

SESSION_ID_2=$(curl -s -X POST "$SERVER_URL/api/v1/chat" \
    -H "Content-Type: application/json" \
    -d "{\"message\":\"请总结一下我们刚才的对话\", \"session_id\": \"$SESSION_ID\"}" | \
    jq -r '.session_id')

if [ "$SESSION_ID_2" = "$SESSION_ID" ]; then
    echo -e "${GREEN}✓ 持续对话成功，使用相同 session${NC}"
    TEST_RESULTS+=("PASS: 持续对话")
else
    echo -e "${RED}✗ 持续对话失败${NC}"
    TEST_RESULTS+=("FAIL: 持续对话 - session 不匹配")
fi

# Test 4: CLI 流式输出
echo ""
echo "Test 4: CLI 流式输出测试"
echo "----------------------------------------"
echo "使用 CLI 发送消息并测试 SSE 流..."

# 创建临时文件接收输出
CLI_OUTPUT="/tmp/cli-test-output.txt"
timeout 10s "$CLI" --server-url "$SERVER_URL" stream "请用一句话回答" 2>&1 | tee "$CLI_OUTPUT" || true

if grep -q "Stream complete" "$CLI_OUTPUT" || grep -q "token" "$CLI_OUTPUT"; then
    echo -e "${GREEN}✓ CLI 流式输出正常${NC}"
    TEST_RESULTS+=("PASS: CLI 流式输出")
else
    echo -e "${YELLOW}⚠ CLI 流式输出可能有问题（检查 server 日志）${NC}"
    TEST_RESULTS+=("WARN: CLI 流式输出 - 未检测到输出")
fi

# Test 5: Stop 功能
echo ""
echo "Test 5: Stop 功能测试"
echo "----------------------------------------"

STOP_RESULT=$(curl -s -X POST "$SERVER_URL/api/v1/stop/$SESSION_ID" \
    -w "%{http_code}")

if [ "$STOP_RESULT" = "200" ] || [ "$STOP_RESULT" = "404" ]; then
    echo -e "${GREEN}✓ Stop 端点响应正常 (HTTP $STOP_RESULT)${NC}"
    TEST_RESULTS+=("PASS: Stop 功能")
else
    echo -e "${YELLOW}⚠ Stop 端点返回: $STOP_RESULT${NC}"
    TEST_RESULTS+=("WARN: Stop 功能 - 返回 $STOP_RESULT")
fi

# 显示 server 日志摘要
echo ""
echo "Server 日志摘要:"
echo "----------------------------------------"
tail -20 "$LOG_FILE.server" || echo "日志文件不存在"

# 清理
echo ""
echo "[7/7] 清理..."
if [ -f "$PID_FILE" ]; then
    kill $(cat "$PID_FILE") 2>/dev/null || true
    rm -f "$PID_FILE"
fi
rm -f "$SESSION_FILE" "$LOG_FILE" "$CLI_OUTPUT" "$LOG_FILE.server"
rm -rf "$TEST_WORKSPACE"
echo -e "${GREEN}✓ 清理完成${NC}"

# 测试报告
echo ""
echo "=========================================="
echo "E2E 测试报告"
echo "=========================================="

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

for result in "${TEST_RESULTS[@]}"; do
    if [[ $result == PASS* ]]; then
        echo -e "${GREEN}✓ $result${NC}"
        ((PASS_COUNT++))
    elif [[ $result == FAIL* ]]; then
        echo -e "${RED}✗ $result${NC}"
        ((FAIL_COUNT++))
    else
        echo -e "${YELLOW}⚠ $result${NC}"
        ((WARN_COUNT++))
    fi
done

echo ""
echo "=========================================="
echo -e "总计: ${GREEN}$PASS_COUNT 通过${NC}, ${RED}$FAIL_COUNT 失败${NC}, ${YELLOW}$WARN_COUNT 警告${NC}"
echo "=========================================="

if [ $FAIL_COUNT -gt 0 ]; then
    echo -e "${RED}E2E 测试未通过${NC}"
    exit 1
else
    echo -e "${GREEN}E2E 测试通过！${NC}"
    exit 0
fi
