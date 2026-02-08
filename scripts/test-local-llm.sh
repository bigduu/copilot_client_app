#!/bin/bash
# Test with localhost:12123 LLM API

echo "=========================================="
echo "Testing with localhost:12123"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_ROOT="$HOME/workspace/copilot_client_app"

# Kill existing server
pkill -f "copilot-agent-server" 2>/dev/null || true
sleep 1

echo ""
echo "Starting server with localhost:12123..."
DEBUG=true "$PROJECT_ROOT/target/release/copilot-agent-server" \
  --llm-base-url http://localhost:12123 \
  --model kimi-for-coding \
  --api-key "sk-test" \
  --port 8080 &

SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for server
echo "Waiting for server..."
for i in {1..20}; do
    if curl -s http://localhost:8080/api/v1/health >/dev/null 2>&1; then
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
echo "Testing CLI..."
"$PROJECT_ROOT/target/release/copilot-agent-cli" --debug send "Hello, please introduce yourself"

echo ""
echo "Press Enter to stop server..."
read

kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true
echo -e "${GREEN}✓ Server stopped${NC}"
