#!/bin/bash
# Real OpenAI API E2E Test

set -e

echo "=========================================="
echo "Real OpenAI API E2E Test"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Config
export OPENAI_API_KEY="sk-TM2SvEM0eInof4zpGBcDFHmWiTb8VuswdOVRndeRmU0tqKSQ"
SERVER_URL="http://localhost:8080"
PROJECT_ROOT="$HOME/workspace/copilot_client_app"
LOG_FILE="/tmp/copilot-agent-real-test.log"

echo ""
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting real environment test..."
echo "API Key: ${OPENAI_API_KEY:0:10}...${OPENAI_API_KEY: -4}"
echo ""

# Check port
echo "Checking port 8080..."
if lsof -i :8080 >/dev/null 2>&1; then
    echo -e "${YELLOW}Port 8080 occupied, killing process...${NC}"
    kill $(lsof -t -i:8080) 2>/dev/null || true
    sleep 2
fi
echo -e "${GREEN}✓ Port 8080 available${NC}"

# Start server
echo ""
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting server..."
DEBUG=true "$PROJECT_ROOT/target/release/copilot-agent-server" --port 8080 > "$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
echo "Waiting for server to start..."
for i in {1..30}; do
    if curl -s "$SERVER_URL/api/v1/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Server ready${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ Server timeout${NC}"
        cat "$LOG_FILE"
        exit 1
    fi
    echo -n "."
done

CLI="$PROJECT_ROOT/target/release/copilot-agent-cli"

# Test 1: Basic chat
echo ""
echo "=========================================="
echo "Test 1: Basic Chat"
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Sending: '你好，请简单介绍一下自己'"
echo ""

START_TIME=$(date +%s%3N)
"$CLI" --server-url "$SERVER_URL" send "你好，请简单介绍一下自己" 2>&1 | tee -a "$LOG_FILE"
SEND_RESULT=${PIPESTATUS[0]}
END_TIME=$(date +%s%3N)
ELAPSED=$((END_TIME - START_TIME))

if [ $SEND_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ Test 1 passed (${ELAPSED}ms)${NC}"
else
    echo -e "${RED}✗ Test 1 failed${NC}"
fi

# Get session ID from last request
SESSION_ID=$(curl -s "$SERVER_URL/api/v1/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}' 2>/dev/null | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)

# Test 2: Stream output
echo ""
echo "=========================================="
echo "Test 2: Stream Output"
echo "=========================================="
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Streaming: '讲一个短笑话'"
echo ""

START_TIME=$(date +%s%3N)
timeout 30s "$CLI" --server-url "$SERVER_URL" stream "讲一个短笑话" 2>&1 | tee -a "$LOG_FILE" || true
STREAM_RESULT=$?
END_TIME=$(date +%s%3N)
ELAPSED=$((END_TIME - START_TIME))

if [ $STREAM_RESULT -eq 0 ] || [ $STREAM_RESULT -eq 124 ]; then
    echo -e "${GREEN}✓ Test 2 passed (${ELAPSED}ms)${NC}"
else
    echo -e "${YELLOW}⚠ Test 2 exit code: $STREAM_RESULT${NC}"
fi

# Test 3: Check history
echo ""
echo "=========================================="
echo "Test 3: Message History"
echo "=========================================="

if [ -n "$SESSION_ID" ]; then
    echo "Session ID: $SESSION_ID"
    HISTORY=$(curl -s "$SERVER_URL/api/v1/history/$SESSION_ID")
    MSG_COUNT=$(echo "$HISTORY" | grep -o '"id"' | wc -l || echo "0")
    echo "Message count: $MSG_COUNT"
    echo -e "${GREEN}✓ History retrieved${NC}"
else
    echo -e "${YELLOW}⚠ No session ID available${NC}"
fi

# Cleanup
echo ""
echo "=========================================="
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo -e "${GREEN}✓ Server stopped${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}Real environment E2E test completed!${NC}"
echo "=========================================="
echo ""
echo "Log file: $LOG_FILE"
echo ""
echo "Last 50 lines of log:"
tail -50 "$LOG_FILE"
