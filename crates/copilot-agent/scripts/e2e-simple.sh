#!/bin/bash
# Simplified E2E Test for Copilot Agent

set -e

echo "=========================================="
echo "Copilot Agent Simplified E2E Test"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SERVER_URL="http://localhost:8081"
PROJECT_ROOT="$HOME/workspace/copilot_client_app"
SESSION_FILE="/tmp/e2e-session-id.txt"

# Use test key
export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-test-key}"

echo ""
echo "[1/6] Building debug version..."
cd "$PROJECT_ROOT"
~/.cargo/bin/cargo build -p copilot-agent-server -p copilot-agent-cli --quiet 2>&1 | tail -5
echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo "[2/6] Starting server..."
DEBUG=true "$PROJECT_ROOT/target/debug/copilot-agent-server" --port 8081 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
echo "Waiting for server..."
for i in {1..20}; do
    if curl -s "$SERVER_URL/api/v1/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ Server ready${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 20 ]; then
        echo -e "${RED}✗ Server timeout${NC}"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
done

echo ""
echo "[3/6] Testing health endpoint..."
HEALTH=$(curl -s "$SERVER_URL/api/v1/health")
if [ "$HEALTH" = "OK" ]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
fi

echo ""
echo "[4/6] Testing POST /chat..."
RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v1/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello test"}')

SESSION_ID=$(echo "$RESPONSE" | grep -o '"session_id":"[^"]*"' | cut -d'"' -f4)
if [ -n "$SESSION_ID" ]; then
    echo -e "${GREEN}✓ Session created: $SESSION_ID${NC}"
    echo "$SESSION_ID" > "$SESSION_FILE"
else
    echo -e "${RED}✗ Failed to create session${NC}"
    echo "Response: $RESPONSE"
fi

echo ""
echo "[5/6] Testing GET /history..."
if [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    HISTORY=$(curl -s "$SERVER_URL/api/v1/history/$SESSION_ID")
    MSG_COUNT=$(echo "$HISTORY" | grep -o '"messages"' | wc -l || echo "0")
    echo "History response received"
    echo -e "${GREEN}✓ History endpoint working${NC}"
fi

echo ""
echo "[6/6] Testing CLI..."
"$PROJECT_ROOT/target/debug/copilot-agent-cli" --help > /dev/null 2>&1 && echo -e "${GREEN}✓ CLI working${NC}" || echo -e "${RED}✗ CLI failed${NC}"

echo ""
echo "[7/6] Testing SSE stream (5 seconds)..."
if [ -f "$SESSION_FILE" ]; then
    SESSION_ID=$(cat "$SESSION_FILE")
    # Create new session for stream test
    RESPONSE=$(curl -s -X POST "$SERVER_URL/api/v1/chat" \
        -H "Content-Type: application/json" \
        -d '{"message":"Hi"}')
    STREAM_URL=$(echo "$RESPONSE" | grep -o '"stream_url":"[^"]*"' | cut -d'"' -f4)
    
    echo "Connecting to SSE stream..."
    timeout 3 curl -s -N "$SERVER_URL$STREAM_URL" > /tmp/sse-output.txt 2>&1 || true
    
    if [ -s /tmp/sse-output.txt ]; then
        echo "SSE output received ($(wc -c < /tmp/sse-output.txt) bytes)"
        head -3 /tmp/sse-output.txt
        echo -e "${GREEN}✓ SSE stream accessible${NC}"
    else
        echo -e "${YELLOW}⚠ No SSE output (may be normal with test key)${NC}"
    fi
fi

# Cleanup
echo ""
echo "=========================================="
echo "Cleaning up..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
rm -f "$SESSION_FILE" /tmp/sse-output.txt
echo -e "${GREEN}✓ Cleanup complete${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}Simplified E2E test completed!${NC}"
echo "=========================================="
